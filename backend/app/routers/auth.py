from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import get_settings
from app.core.logger import get_logger
from app.core.security import create_access_token, decode_access_token, verify_password
from app.schemas.auth import LoginRequest, TokenOut

settings = get_settings()
logger = get_logger("app.routers.auth")
router = APIRouter(prefix="/auth", tags=["Autenticação"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


@router.post("/login", response_model=TokenOut, summary="Login do administrador")
async def login(dados: LoginRequest, request: Request):
    """
    Autentica o administrador com e-mail e senha.

    Em produção, substitua esta lógica por Supabase Auth ou outro provedor.
    As credenciais ficam nas variáveis de ambiente ADMIN_EMAIL e ADMIN_PASSWORD.
    """
    client_ip = request.client.host if request.client else "unknown"
    email_valido = dados.email == settings.ADMIN_EMAIL
    senha_valida = dados.password == settings.ADMIN_PASSWORD

    if not email_valido or not senha_valida:
        logger.warning(
            "Login falhou  [email=%s  ip=%s  motivo=%s]",
            dados.email,
            client_ip,
            "email inválido" if not email_valido else "senha inválida",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": dados.email, "role": "admin"})
    logger.info("Login bem-sucedido  [email=%s  ip=%s]", dados.email, client_ip)
    return TokenOut(access_token=token)


async def get_current_admin(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependency que valida o JWT e garante que o usuário é admin.
    Use como: `dependencies=[Depends(get_current_admin)]`
    """
    payload = decode_access_token(token)
    if not payload or payload.get("role") != "admin":
        logger.warning("Token inválido ou expirado rejeitado")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload

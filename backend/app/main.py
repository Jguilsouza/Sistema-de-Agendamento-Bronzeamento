import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, create_all_tables
from app.core.logger import get_logger, setup_logging
from app.routers import agendamentos, auth, clientes, horarios
from app.services.horario_service import seed_dados_iniciais

# Inicializa logging antes de qualquer outra coisa
setup_logging()
logger = get_logger("app.main")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Executado na inicialização e encerramento da aplicação."""
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("🚀 Iniciando Iluminada Bronze API  [log_level=%s]", settings.LOG_LEVEL)
    await create_all_tables()
    logger.info("✅ Tabelas verificadas/criadas com sucesso")
    async with AsyncSessionLocal() as db:
        await seed_dados_iniciais(db)
    logger.info("✅ Dados iniciais verificados — API pronta para receber requisições")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("🛑 Encerrando aplicação")


app = FastAPI(
    title="Iluminada Bronze – API de Agendamentos",
    description=(
        "API REST para gerenciamento de agendamentos de bronzeamento (em pé e deitado). "
        "Limite de 20 vagas por horário. "
        "Rotas públicas para clientes e rotas protegidas para administradores."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware de logging de requests ─────────────────────────────────────────
_req_logger = get_logger("app.requests")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Loga cada requisição HTTP com método, path, status e duração."""
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000

    # Nível WARNING para erros de servidor, INFO para o resto
    log = _req_logger.warning if response.status_code >= 500 else _req_logger.info
    log(
        "%s %s → %d  (%.0fms)  [client=%s]",
        request.method,
        request.url.path,
        response.status_code,
        ms,
        request.client.host if request.client else "unknown",
    )
    return response


# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(agendamentos.router)
app.include_router(horarios.router)
app.include_router(clientes.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "Iluminada Bronze API está no ar! ☀️"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}

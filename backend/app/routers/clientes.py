from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.routers.auth import get_current_admin
from app.schemas.cliente import ClienteOut
from app.services import cliente_service

router = APIRouter(
    prefix="/clientes",
    tags=["Clientes"],
    dependencies=[Depends(get_current_admin)],
)


@router.get(
    "/",
    response_model=list[ClienteOut],
    summary="Buscar clientes por nome ou CPF",
)
async def buscar_clientes(
    q: str | None = Query(None, description="Nome ou CPF do cliente"),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna clientes únicos agrupados por CPF.
    Busca por nome (parcial) ou CPF (com ou sem máscara).
    """
    return await cliente_service.buscar_clientes(db, q=q, limit=limit)


@router.get(
    "/inativos",
    response_model=list[ClienteOut],
    summary="Clientes inativos (>2 meses sem agendar)",
)
async def clientes_inativos(
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna clientes que não possuem agendamento confirmado nos últimos 60 dias.
    Ordenados do mais antigo ao mais recente (quem está há mais tempo sem visitar).
    """
    return await cliente_service.buscar_clientes(db, inativos_apenas=True, limit=limit)

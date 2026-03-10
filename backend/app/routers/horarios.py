from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.routers.auth import get_current_admin
from app.schemas.horario import (
    DiaBloqueadoCreate,
    DiaBloqueadoOut,
    DiaBloqueadoUpdate,
    HorarioAtendimentoCreate,
    HorarioAtendimentoOut,
    HorarioAtendimentoUpdate,
    HorarioBloqueadoCreate,
    HorarioBloqueadoOut,
)
from app.services import horario_service

router = APIRouter(
    prefix="/horarios",
    tags=["Horários de Atendimento"],
    dependencies=[Depends(get_current_admin)],
)


# ── Horários de atendimento ───────────────────────────────────────────────────

@router.get("/", response_model=list[HorarioAtendimentoOut], summary="Listar horários")
async def listar_horarios(
    tipo_bronze: str | None = None,
    apenas_ativos: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await horario_service.listar_horarios(db, tipo_bronze, apenas_ativos)


@router.post("/", response_model=HorarioAtendimentoOut, status_code=status.HTTP_201_CREATED,
             summary="Adicionar horário")
async def criar_horario(dados: HorarioAtendimentoCreate, db: AsyncSession = Depends(get_db)):
    return await horario_service.criar_horario(db, dados)


@router.patch("/{horario_id}", response_model=HorarioAtendimentoOut, summary="Editar horário")
async def atualizar_horario(
    horario_id: UUID, dados: HorarioAtendimentoUpdate, db: AsyncSession = Depends(get_db)
):
    try:
        return await horario_service.atualizar_horario(db, str(horario_id), dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{horario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover horário")
async def deletar_horario(horario_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        await horario_service.deletar_horario(db, str(horario_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Dias bloqueados ───────────────────────────────────────────────────────────

@router.get("/bloqueios", response_model=list[DiaBloqueadoOut], summary="Listar dias bloqueados")
async def listar_bloqueios(
    apenas_ativos: bool = False, db: AsyncSession = Depends(get_db)
):
    return await horario_service.listar_dias_bloqueados(db, apenas_ativos)


@router.post("/bloqueios", response_model=DiaBloqueadoOut, status_code=status.HTTP_201_CREATED,
             summary="Adicionar bloqueio")
async def criar_bloqueio(dados: DiaBloqueadoCreate, db: AsyncSession = Depends(get_db)):
    return await horario_service.criar_dia_bloqueado(db, dados)


@router.patch("/bloqueios/{bloqueio_id}", response_model=DiaBloqueadoOut, summary="Editar bloqueio")
async def atualizar_bloqueio(
    bloqueio_id: UUID, dados: DiaBloqueadoUpdate, db: AsyncSession = Depends(get_db)
):
    try:
        return await horario_service.atualizar_dia_bloqueado(db, str(bloqueio_id), dados)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/bloqueios/{bloqueio_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remover bloqueio")
async def deletar_bloqueio(bloqueio_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        await horario_service.deletar_dia_bloqueado(db, str(bloqueio_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Horários bloqueados (slots pontuais) ──────────────────────────────────────

@router.get(
    "/slots-bloqueados",
    response_model=list[HorarioBloqueadoOut],
    summary="Listar slots bloqueados",
)
async def listar_slots_bloqueados(
    data: date | None = Query(None, description="Filtrar por data (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
):
    """Lista bloqueios pontuais de horários criados pelo admin."""
    return await horario_service.listar_horarios_bloqueados(db, data)


@router.post(
    "/slots-bloqueados",
    response_model=HorarioBloqueadoOut,
    status_code=status.HTTP_201_CREATED,
    summary="Bloquear slot",
)
async def criar_slot_bloqueado(
    dados: HorarioBloqueadoCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Bloqueia um horário específico em uma data.
    - tipo_bronze=null e horario=null → bloqueia o dia inteiro para todos os serviços
    - horario=null → bloqueia o dia inteiro para o tipo informado
    - horario informado → bloqueia apenas aquele slot
    """
    return await horario_service.criar_horario_bloqueado(db, dados)


@router.delete(
    "/slots-bloqueados/{bloqueio_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover bloqueio de slot",
)
async def deletar_slot_bloqueado(bloqueio_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        await horario_service.deletar_horario_bloqueado(db, str(bloqueio_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

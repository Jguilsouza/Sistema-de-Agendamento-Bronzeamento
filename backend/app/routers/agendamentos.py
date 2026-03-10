from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logger import get_logger, mask_cpf, mask_phone
from app.routers.auth import get_current_admin
from app.schemas.agendamento import (
    AgendamentoClienteOut,
    AgendamentoCreate,
    AgendamentoOut,
    AgendamentoPublicOut,
    AgendamentoUpdate,
    CancelamentoClienteRequest,
    ConfirmarPresencaRequest,
    DisponibilidadeOut,
    ReagendamentoRequest,
)
from app.services import agendamento_service

router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])
logger = get_logger("app.routers.agendamentos")


# ── Rotas públicas (cliente) ──────────────────────────────────────────────────

@router.get("/disponibilidade", response_model=DisponibilidadeOut, summary="Verificar disponibilidade")
async def verificar_disponibilidade(
    tipo_bronze: str = Query(..., pattern="^(pe|deitado|carioca)$", description="'pe', 'deitado' ou 'carioca'"),
    data: date = Query(..., description="Data no formato YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna todos os horários do dia com o número de vagas disponíveis.
    Horários passados (mais de 20 min) são automaticamente excluídos.
    """
    return await agendamento_service.obter_disponibilidade(db, tipo_bronze, data)


@router.post(
    "/",
    response_model=AgendamentoPublicOut,
    status_code=status.HTTP_201_CREATED,
    summary="Criar agendamento (cliente)",
)
async def criar_agendamento(
    dados: AgendamentoCreate,
    db: AsyncSession = Depends(get_db),
):
    """Endpoint público para o cliente criar um agendamento."""
    logger.info(
        "Novo agendamento solicitado  [nome=%s  cpf=%s  tel=%s  tipo=%s  data=%s  horario=%s]",
        dados.cliente_nome,
        mask_cpf(dados.cliente_cpf),
        mask_phone(dados.cliente_telefone),
        dados.tipo_bronze,
        dados.data_agendamento,
        dados.horario_agendamento,
    )
    try:
        agendamento = await agendamento_service.criar_agendamento(db, dados)
        logger.info(
            "Agendamento criado com sucesso  [id=%s  tipo=%s  data=%s  horario=%s]",
            agendamento.id,
            agendamento.tipo_bronze,
            agendamento.data_agendamento,
            agendamento.horario_agendamento,
        )
        return agendamento
    except ValueError as e:
        logger.warning(
            "Agendamento recusado  [motivo=%s  tipo=%s  data=%s  horario=%s]",
            str(e), dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        if "uq_cpf_agendamento" in str(e):
            logger.warning(
                "Conflito de agendamento (CPF duplicado)  [cpf=%s  tipo=%s  data=%s  horario=%s]",
                mask_cpf(dados.cliente_cpf), dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Você já possui um agendamento para este serviço/data/horário.",
            )
        logger.error(
            "Erro inesperado ao criar agendamento  [erro=%s]", str(e), exc_info=True
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get(
    "/consulta",
    response_model=list[AgendamentoClienteOut],
    summary="Consultar agendamentos por CPF (cliente)",
)
async def consultar_por_cpf(
    cpf: str = Query(..., description="CPF do cliente (somente números ou formatado)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna os agendamentos confirmados de um cliente pelo CPF.
    Também informa se cada agendamento pode ser reagendado/cancelado (> 24h).
    """
    import re
    cpf_limpo = re.sub(r"[^0-9]", "", cpf)
    agendamentos = await agendamento_service.buscar_agendamentos_por_cpf(db, cpf_limpo)

    resultado = []
    for ag in agendamentos:
        from app.services.agendamento_service import _pode_reagendar
        pode = _pode_reagendar(ag)
        resultado.append(
            AgendamentoClienteOut(
                id=ag.id,
                tipo_bronze=ag.tipo_bronze,
                data_agendamento=ag.data_agendamento,
                horario_agendamento=ag.horario_agendamento,
                cliente_nome=ag.cliente_nome,
                status=ag.status,
                pode_reagendar=pode,
                criado_em=ag.criado_em,
            )
        )
    return resultado


@router.post(
    "/{agendamento_id}/reagendar",
    response_model=AgendamentoClienteOut,
    summary="Reagendar agendamento (cliente)",
)
async def reagendar_agendamento(
    agendamento_id: UUID,
    dados: ReagendamentoRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Permite ao cliente reagendar usando seu CPF.
    Restrição: somente com mais de 24h de antecedência.
    """
    logger.info(
        "Reagendamento solicitado  [id=%s  cpf=%s  nova_data=%s  novo_horario=%s]",
        agendamento_id, mask_cpf(dados.cpf), dados.nova_data, dados.novo_horario,
    )
    try:
        ag = await agendamento_service.reagendar_agendamento_cliente(
            db, str(agendamento_id), dados
        )
        from app.services.agendamento_service import _pode_reagendar
        logger.info(
            "Reagendamento efetuado  [id=%s  data=%s  horario=%s]",
            ag.id, ag.data_agendamento, ag.horario_agendamento,
        )
        return AgendamentoClienteOut(
            id=ag.id,
            tipo_bronze=ag.tipo_bronze,
            data_agendamento=ag.data_agendamento,
            horario_agendamento=ag.horario_agendamento,
            cliente_nome=ag.cliente_nome,
            status=ag.status,
            pode_reagendar=_pode_reagendar(ag),
            criado_em=ag.criado_em,
        )
    except ValueError as e:
        logger.warning("Reagendamento recusado  [id=%s  motivo=%s]", agendamento_id, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{agendamento_id}/cancelar-cliente",
    response_model=AgendamentoClienteOut,
    summary="Cancelar agendamento (cliente)",
)
async def cancelar_agendamento_cliente(
    agendamento_id: UUID,
    dados: CancelamentoClienteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Permite ao cliente cancelar usando seu CPF.
    Restrição: somente com mais de 24h de antecedência.
    """
    logger.info(
        "Cancelamento pelo cliente solicitado  [id=%s  cpf=%s]",
        agendamento_id, mask_cpf(dados.cpf),
    )
    try:
        ag = await agendamento_service.cancelar_agendamento_cliente(
            db, str(agendamento_id), dados.cpf
        )
        logger.info(
            "Cancelamento pelo cliente efetuado  [id=%s  tipo=%s  data=%s]",
            ag.id, ag.tipo_bronze, ag.data_agendamento,
        )
        return AgendamentoClienteOut(
            id=ag.id,
            tipo_bronze=ag.tipo_bronze,
            data_agendamento=ag.data_agendamento,
            horario_agendamento=ag.horario_agendamento,
            cliente_nome=ag.cliente_nome,
            status=ag.status,
            pode_reagendar=False,
            criado_em=ag.criado_em,
        )
    except ValueError as e:
        logger.warning("Cancelamento recusado  [id=%s  motivo=%s]", agendamento_id, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ── Rotas protegidas (admin) ──────────────────────────────────────────────────

@router.get(
    "/admin",
    response_model=list[AgendamentoOut],
    summary="Listar agendamentos (admin)",
    dependencies=[Depends(get_current_admin)],
)
async def listar_agendamentos_admin(
    tipo_bronze: str | None = Query(None, pattern="^(pe|deitado|carioca)$"),
    data: date | None = Query(None),
    data_inicio: date | None = Query(None, description="Data inicial (para relatórios)"),
    data_fim: date | None = Query(None, description="Data final (para relatórios)"),
    status_filtro: str | None = Query(None, alias="status", pattern="^(confirmado|cancelado)$"),
    nome: str | None = Query(None, description="Busca parcial por nome do cliente"),
    limit: int = Query(100, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos os agendamentos com filtros. Requer autenticação de admin."""
    return await agendamento_service.listar_agendamentos(
        db, tipo_bronze, data, data_inicio, data_fim, status_filtro, nome, limit, offset
    )


@router.patch(
    "/admin/{agendamento_id}",
    response_model=AgendamentoOut,
    summary="Atualizar agendamento (admin)",
    dependencies=[Depends(get_current_admin)],
)
async def atualizar_agendamento(
    agendamento_id: UUID,
    dados: AgendamentoUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Atualiza status ou horário de um agendamento. Requer autenticação de admin."""
    logger.info("Admin atualizando agendamento  [id=%s  dados=%s]", agendamento_id, dados.model_dump(exclude_unset=True))
    try:
        ag = await agendamento_service.atualizar_agendamento(db, str(agendamento_id), dados)
        logger.info("Agendamento atualizado  [id=%s]", agendamento_id)
        return ag
    except ValueError as e:
        logger.warning("Atualização falhou  [id=%s  motivo=%s]", agendamento_id, str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete(
    "/admin/{agendamento_id}",
    response_model=AgendamentoOut,
    summary="Cancelar agendamento (admin)",
    dependencies=[Depends(get_current_admin)],
)
async def cancelar_agendamento(
    agendamento_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Cancela um agendamento (soft delete). Requer autenticação de admin."""
    logger.info("Admin cancelando agendamento  [id=%s]", agendamento_id)
    try:
        ag = await agendamento_service.cancelar_agendamento(db, str(agendamento_id))
        logger.info(
            "Agendamento cancelado pelo admin  [id=%s  tipo=%s  data=%s  cliente=%s]",
            ag.id, ag.tipo_bronze, ag.data_agendamento, ag.cliente_nome,
        )
        return ag
    except ValueError as e:
        logger.warning("Cancelamento admin falhou  [id=%s  motivo=%s]", agendamento_id, str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/admin/{agendamento_id}/confirmar-presenca",
    response_model=AgendamentoOut,
    summary="Confirmar presença e pagamento (admin)",
    dependencies=[Depends(get_current_admin)],
)
async def confirmar_presenca(
    agendamento_id: UUID,
    dados: ConfirmarPresencaRequest,
    db: AsyncSession = Depends(get_db),
):
    """Confirma que o cliente compareceu e registra a forma de pagamento."""
    logger.info(
        "Confirmando presença  [id=%s  pagamento=%s]",
        agendamento_id, dados.forma_pagamento,
    )
    try:
        ag = await agendamento_service.confirmar_presenca(
            db, str(agendamento_id), dados.forma_pagamento
        )
        logger.info(
            "Presença confirmada  [id=%s  cliente=%s  tipo=%s  pagamento=%s]",
            ag.id, ag.cliente_nome, ag.tipo_bronze, ag.forma_pagamento,
        )
        return ag
    except ValueError as e:
        logger.warning("Confirmação de presença falhou  [id=%s  motivo=%s]", agendamento_id, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

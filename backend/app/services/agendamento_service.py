from datetime import date, datetime, time, timedelta, timezone
from typing import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logger import get_logger, mask_cpf
from app.models.agendamento import Agendamento
from app.models.horario import HorarioAtendimento
from app.schemas.agendamento import (
    AgendamentoCreate,
    AgendamentoUpdate,
    DisponibilidadeOut,
    HorarioDisponivel,
    ReagendamentoRequest,
)
from app.services.horario_service import (
    data_esta_bloqueada,
    horarios_para_data,
    slot_esta_bloqueado,
)

settings = get_settings()
logger = get_logger("app.services.agendamento")

# ── Fuso horário Brasil (UTC-3) ───────────────────────────────────────────────
FUSO_BRASIL = timezone(timedelta(hours=-3))
TOLERANCIA_MINUTOS = 20


# ── Helpers ───────────────────────────────────────────────────────────────────

def horario_ainda_disponivel(data_ag: date, horario_ag: time) -> bool:
    """
    Retorna True se o horário ainda pode ser agendado.
    Permite agendamento até TOLERANCIA_MINUTOS após o horário definido.
    Ex: horário 10:00 → aceita agendamentos até 10:20.
    """
    agora = datetime.now(FUSO_BRASIL)
    horario_dt = datetime(
        data_ag.year, data_ag.month, data_ag.day,
        horario_ag.hour, horario_ag.minute,
        tzinfo=FUSO_BRASIL,
    ) + timedelta(minutes=TOLERANCIA_MINUTOS)
    return agora <= horario_dt


async def _vagas_do_horario(
    db: AsyncSession, tipo_bronze: str, data: date, horario: time
) -> int:
    """Busca a configuração de vagas para um horário específico no banco."""
    dia_semana = data.weekday()
    stmt = select(HorarioAtendimento.vagas).where(
        HorarioAtendimento.tipo_bronze == tipo_bronze,
        HorarioAtendimento.horario == horario,
        HorarioAtendimento.ativo == True,  # noqa: E712
        or_(
            HorarioAtendimento.dia_semana == None,   # noqa: E711
            HorarioAtendimento.dia_semana == dia_semana,
        ),
    )
    resultado = await db.execute(stmt)
    vagas_lista = resultado.scalars().all()
    return min(vagas_lista) if vagas_lista else settings.MAX_VAGAS_POR_HORARIO


# ── CRUD de agendamentos ──────────────────────────────────────────────────────

async def criar_agendamento(db: AsyncSession, dados: AgendamentoCreate) -> Agendamento:
    """Cria um novo agendamento respeitando bloqueios de dia, slots e limite de vagas."""

    # 1. Verificar se a data está bloqueada (bloqueio recorrente)
    if await data_esta_bloqueada(db, dados.data_agendamento):
        logger.warning(
            "Criação negada — data bloqueada  [tipo=%s  data=%s]",
            dados.tipo_bronze, dados.data_agendamento,
        )
        raise ValueError("Esta data não possui atendimento. Por favor, escolha outro dia.")

    # 2. Verificar se o slot está bloqueado pontualmente
    if await slot_esta_bloqueado(db, dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento):
        logger.warning(
            "Criação negada — slot bloqueado  [tipo=%s  data=%s  horario=%s]",
            dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
        )
        raise ValueError("Este horário está bloqueado. Por favor, escolha outro horário.")

    # 3. Verificar se o horário é válido para o dia
    horarios_validos = await horarios_para_data(db, dados.tipo_bronze, dados.data_agendamento)
    if dados.horario_agendamento not in horarios_validos:
        logger.warning(
            "Criação negada — horário inválido  [tipo=%s  data=%s  horario=%s  validos=%s]",
            dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
            [str(h) for h in horarios_validos],
        )
        raise ValueError("Horário inválido para este serviço/dia.")

    # 4. Verificar se o horário ainda está disponível (não passou do prazo)
    if not horario_ainda_disponivel(dados.data_agendamento, dados.horario_agendamento):
        logger.warning(
            "Criação negada — horário expirado  [tipo=%s  data=%s  horario=%s]",
            dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
        )
        raise ValueError("Este horário já passou. Por favor, escolha um horário futuro.")

    # 5. Verificar vagas disponíveis
    vagas_config = await _vagas_do_horario(
        db, dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento
    )
    stmt_count = (
        select(func.count())
        .select_from(Agendamento)
        .where(
            and_(
                Agendamento.tipo_bronze == dados.tipo_bronze,
                Agendamento.data_agendamento == dados.data_agendamento,
                Agendamento.horario_agendamento == dados.horario_agendamento,
                Agendamento.status == "confirmado",
            )
        )
    )
    ocupacao = (await db.execute(stmt_count)).scalar_one()

    if ocupacao >= vagas_config:
        logger.warning(
            "Criação negada — horário lotado  [tipo=%s  data=%s  horario=%s  ocupacao=%d  vagas=%d]",
            dados.tipo_bronze, dados.data_agendamento, dados.horario_agendamento,
            ocupacao, vagas_config,
        )
        raise ValueError(f"Horário lotado! Máximo de {vagas_config} vagas atingido.")

    # 6. Criar agendamento
    novo = Agendamento(
        tipo_bronze=dados.tipo_bronze,
        data_agendamento=dados.data_agendamento,
        horario_agendamento=dados.horario_agendamento,
        cliente_nome=dados.cliente_nome.strip().title(),
        cliente_telefone=dados.cliente_telefone,
        cliente_cpf=dados.cliente_cpf,
        status="confirmado",
    )
    db.add(novo)
    await db.flush()
    await db.refresh(novo)
    logger.debug(
        "Agendamento persistido  [id=%s  ocupacao_apos=%d/%d]",
        novo.id, ocupacao + 1, vagas_config,
    )
    return novo


async def listar_agendamentos(
    db: AsyncSession,
    tipo_bronze: str | None = None,
    data: date | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    status: str | None = None,
    nome: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[Agendamento]:
    stmt = select(Agendamento).order_by(
        Agendamento.data_agendamento, Agendamento.horario_agendamento
    )
    if tipo_bronze:
        stmt = stmt.where(Agendamento.tipo_bronze == tipo_bronze)
    if data:
        stmt = stmt.where(Agendamento.data_agendamento == data)
    if data_inicio:
        stmt = stmt.where(Agendamento.data_agendamento >= data_inicio)
    if data_fim:
        stmt = stmt.where(Agendamento.data_agendamento <= data_fim)
    if status:
        stmt = stmt.where(Agendamento.status == status)
    if nome:
        stmt = stmt.where(Agendamento.cliente_nome.ilike(f"%{nome}%"))
    stmt = stmt.limit(limit).offset(offset)
    resultado = await db.execute(stmt)
    return resultado.scalars().all()


async def confirmar_presenca(
    db: AsyncSession, agendamento_id: str, forma_pagamento: str
) -> Agendamento:
    """Confirma presença do cliente e registra forma de pagamento."""
    agendamento = await buscar_agendamento_por_id(db, agendamento_id)
    if not agendamento:
        logger.warning("Presença: agendamento não encontrado  [id=%s]", agendamento_id)
        raise ValueError("Agendamento não encontrado.")
    if agendamento.status != "confirmado":
        logger.warning(
            "Presença: status inválido  [id=%s  status=%s]",
            agendamento_id, agendamento.status,
        )
        raise ValueError("Apenas agendamentos confirmados podem ter presença registrada.")
    agendamento.presenca_confirmada = True
    agendamento.forma_pagamento = forma_pagamento
    await db.flush()
    await db.refresh(agendamento)
    logger.info(
        "Presença registrada  [id=%s  cliente=%s  tipo=%s  data=%s  pagamento=%s]",
        agendamento.id, agendamento.cliente_nome, agendamento.tipo_bronze,
        agendamento.data_agendamento, forma_pagamento,
    )
    return agendamento


async def buscar_agendamento_por_id(db: AsyncSession, agendamento_id: str) -> Agendamento | None:
    resultado = await db.execute(
        select(Agendamento).where(Agendamento.id == agendamento_id)
    )
    return resultado.scalar_one_or_none()


async def buscar_agendamentos_por_cpf(
    db: AsyncSession, cpf: str
) -> Sequence[Agendamento]:
    """
    Busca agendamentos confirmados de um cliente pelo CPF.
    Retorna apenas agendamentos futuros (dentro da tolerância de 20 min).
    """
    agora_brasil = datetime.now(FUSO_BRASIL)
    data_hoje = agora_brasil.date()

    stmt = (
        select(Agendamento)
        .where(
            Agendamento.cliente_cpf == cpf,
            Agendamento.status == "confirmado",
            # Traz apenas datas de hoje em diante (otimização SQL)
            Agendamento.data_agendamento >= data_hoje,
        )
        .order_by(Agendamento.data_agendamento, Agendamento.horario_agendamento)
    )
    resultado = await db.execute(stmt)
    todos = resultado.scalars().all()

    # Filtra no Python os que já passaram do horário (com tolerância de 20 min)
    return [ag for ag in todos if horario_ainda_disponivel(ag.data_agendamento, ag.horario_agendamento)]


async def atualizar_agendamento(
    db: AsyncSession, agendamento_id: str, dados: AgendamentoUpdate
) -> Agendamento:
    agendamento = await buscar_agendamento_por_id(db, agendamento_id)
    if not agendamento:
        raise ValueError("Agendamento não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(agendamento, campo, valor)
    await db.flush()
    await db.refresh(agendamento)
    return agendamento


async def cancelar_agendamento(db: AsyncSession, agendamento_id: str) -> Agendamento:
    agendamento = await buscar_agendamento_por_id(db, agendamento_id)
    if not agendamento:
        logger.warning("Cancelamento: agendamento não encontrado  [id=%s]", agendamento_id)
        raise ValueError("Agendamento não encontrado")
    agendamento.status = "cancelado"
    await db.flush()
    await db.refresh(agendamento)
    logger.info(
        "Agendamento cancelado (admin)  [id=%s  cliente=%s  tipo=%s  data=%s]",
        agendamento.id, agendamento.cliente_nome, agendamento.tipo_bronze, agendamento.data_agendamento,
    )
    return agendamento


# ── Reagendamento / cancelamento pelo cliente ─────────────────────────────────

def _pode_reagendar(agendamento: Agendamento) -> bool:
    """Retorna True se faltam mais de 24h para o agendamento."""
    agendamento_dt = datetime(
        agendamento.data_agendamento.year,
        agendamento.data_agendamento.month,
        agendamento.data_agendamento.day,
        agendamento.horario_agendamento.hour,
        agendamento.horario_agendamento.minute,
        tzinfo=FUSO_BRASIL,
    )
    return (agendamento_dt - datetime.now(FUSO_BRASIL)) > timedelta(hours=24)


async def reagendar_agendamento_cliente(
    db: AsyncSession, agendamento_id: str, dados: ReagendamentoRequest
) -> Agendamento:
    """Permite ao cliente reagendar usando seu CPF. Restrição: > 24h de antecedência."""
    agendamento = await buscar_agendamento_por_id(db, agendamento_id)
    if not agendamento:
        raise ValueError("Agendamento não encontrado.")
    if agendamento.cliente_cpf != dados.cpf:
        raise ValueError("CPF não corresponde a este agendamento.")
    if agendamento.status != "confirmado":
        raise ValueError("Apenas agendamentos confirmados podem ser reagendados.")
    if not _pode_reagendar(agendamento):
        raise ValueError(
            "Reagendamento não permitido. O prazo de 24 horas antes do agendamento já passou."
        )

    # Verificar nova data/horário
    if await data_esta_bloqueada(db, dados.nova_data):
        raise ValueError("A nova data não possui atendimento. Por favor, escolha outro dia.")

    if await slot_esta_bloqueado(db, agendamento.tipo_bronze, dados.nova_data, dados.novo_horario):
        raise ValueError("O novo horário está bloqueado. Por favor, escolha outro horário.")

    horarios_validos = await horarios_para_data(db, agendamento.tipo_bronze, dados.nova_data)
    if dados.novo_horario not in horarios_validos:
        raise ValueError("Horário inválido para este serviço/dia.")

    if not horario_ainda_disponivel(dados.nova_data, dados.novo_horario):
        raise ValueError("O novo horário já passou. Por favor, escolha um horário futuro.")

    # Verificar vagas no novo slot
    vagas_config = await _vagas_do_horario(
        db, agendamento.tipo_bronze, dados.nova_data, dados.novo_horario
    )
    stmt_count = (
        select(func.count())
        .select_from(Agendamento)
        .where(
            and_(
                Agendamento.tipo_bronze == agendamento.tipo_bronze,
                Agendamento.data_agendamento == dados.nova_data,
                Agendamento.horario_agendamento == dados.novo_horario,
                Agendamento.status == "confirmado",
                Agendamento.id != agendamento.id,  # exclui o próprio
            )
        )
    )
    ocupacao = (await db.execute(stmt_count)).scalar_one()
    if ocupacao >= vagas_config:
        raise ValueError(f"Novo horário lotado! Máximo de {vagas_config} vagas atingido.")

    agendamento.data_agendamento = dados.nova_data
    agendamento.horario_agendamento = dados.novo_horario
    await db.flush()
    await db.refresh(agendamento)
    return agendamento


async def cancelar_agendamento_cliente(
    db: AsyncSession, agendamento_id: str, cpf: str
) -> Agendamento:
    """Permite ao cliente cancelar usando seu CPF. Restrição: > 24h de antecedência."""
    agendamento = await buscar_agendamento_por_id(db, agendamento_id)
    if not agendamento:
        logger.warning("Cancelamento cliente: não encontrado  [id=%s  cpf=%s]", agendamento_id, mask_cpf(cpf))
        raise ValueError("Agendamento não encontrado.")
    if agendamento.cliente_cpf != cpf:
        logger.warning("Cancelamento cliente: CPF não confere  [id=%s]", agendamento_id)
        raise ValueError("CPF não corresponde a este agendamento.")
    if agendamento.status != "confirmado":
        raise ValueError("Este agendamento já foi cancelado.")
    if not _pode_reagendar(agendamento):
        logger.warning(
            "Cancelamento cliente: prazo expirado  [id=%s  data=%s  horario=%s]",
            agendamento_id, agendamento.data_agendamento, agendamento.horario_agendamento,
        )
        raise ValueError(
            "Cancelamento não permitido. O prazo de 24 horas antes do agendamento já passou."
        )
    agendamento.status = "cancelado"
    await db.flush()
    await db.refresh(agendamento)
    logger.info(
        "Agendamento cancelado pelo cliente  [id=%s  tipo=%s  data=%s]",
        agendamento.id, agendamento.tipo_bronze, agendamento.data_agendamento,
    )
    return agendamento


# ── Disponibilidade ───────────────────────────────────────────────────────────

async def obter_disponibilidade(
    db: AsyncSession, tipo_bronze: str, data: date
) -> DisponibilidadeOut:
    """Retorna horários e vagas disponíveis. Respeita bloqueios, slots e horários passados."""

    if await data_esta_bloqueada(db, data):
        return DisponibilidadeOut(
            tipo_bronze=tipo_bronze, data=data, horarios=[], dia_bloqueado=True
        )

    horarios = await horarios_para_data(db, tipo_bronze, data)
    if not horarios:
        return DisponibilidadeOut(tipo_bronze=tipo_bronze, data=data, horarios=[])

    # Ocupação atual
    stmt = (
        select(Agendamento.horario_agendamento, func.count().label("total"))
        .where(
            and_(
                Agendamento.tipo_bronze == tipo_bronze,
                Agendamento.data_agendamento == data,
                Agendamento.status == "confirmado",
            )
        )
        .group_by(Agendamento.horario_agendamento)
    )
    resultado = await db.execute(stmt)
    ocupacao_map: dict[time, int] = {
        row.horario_agendamento: row.total for row in resultado.all()
    }

    lista = []
    for h in horarios:
        # Ignorar horários que já passaram (com tolerância de 20 min)
        if not horario_ainda_disponivel(data, h):
            continue

        # Ignorar slots pontualmente bloqueados
        if await slot_esta_bloqueado(db, tipo_bronze, data, h):
            continue

        vagas_total = await _vagas_do_horario(db, tipo_bronze, data, h)
        lista.append(
            HorarioDisponivel(
                horario=h,
                vagas_disponiveis=max(0, vagas_total - ocupacao_map.get(h, 0)),
                vagas_total=vagas_total,
            )
        )

    return DisponibilidadeOut(tipo_bronze=tipo_bronze, data=data, horarios=lista)

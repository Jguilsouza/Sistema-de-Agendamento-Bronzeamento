import calendar
from datetime import date, datetime, time, timedelta, timezone
from typing import Sequence

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.horario import DiaBloqueado, HorarioAtendimento, HorarioBloqueado
from app.schemas.horario import (
    DiaBloqueadoCreate,
    DiaBloqueadoUpdate,
    HorarioAtendimentoCreate,
    HorarioAtendimentoUpdate,
    HorarioBloqueadoCreate,
)


# ── Horários de atendimento ───────────────────────────────────────────────────

async def listar_horarios(
    db: AsyncSession, tipo_bronze: str | None = None, apenas_ativos: bool = True
) -> Sequence[HorarioAtendimento]:
    stmt = select(HorarioAtendimento).order_by(
        HorarioAtendimento.tipo_bronze,
        HorarioAtendimento.dia_semana.nullsfirst(),
        HorarioAtendimento.horario,
    )
    if tipo_bronze:
        stmt = stmt.where(HorarioAtendimento.tipo_bronze == tipo_bronze)
    if apenas_ativos:
        stmt = stmt.where(HorarioAtendimento.ativo == True)  # noqa: E712
    resultado = await db.execute(stmt)
    return resultado.scalars().all()


async def horarios_para_data(
    db: AsyncSession, tipo_bronze: str, data: date
) -> list[time]:
    """Retorna os horários ativos para um tipo e data específicos."""
    dia_semana = data.weekday()  # 0=Seg … 6=Dom
    stmt = (
        select(HorarioAtendimento.horario)
        .where(
            HorarioAtendimento.tipo_bronze == tipo_bronze,
            HorarioAtendimento.ativo == True,  # noqa: E712
            or_(
                HorarioAtendimento.dia_semana == None,   # aplica a todos os dias  # noqa: E711
                HorarioAtendimento.dia_semana == dia_semana,  # dia específico
            ),
        )
        .order_by(HorarioAtendimento.horario)
    )
    resultado = await db.execute(stmt)
    return list(resultado.scalars().all())


async def criar_horario(db: AsyncSession, dados: HorarioAtendimentoCreate) -> HorarioAtendimento:
    novo = HorarioAtendimento(**dados.model_dump())
    db.add(novo)
    await db.flush()
    await db.refresh(novo)
    return novo


async def atualizar_horario(
    db: AsyncSession, horario_id: str, dados: HorarioAtendimentoUpdate
) -> HorarioAtendimento:
    resultado = await db.execute(
        select(HorarioAtendimento).where(HorarioAtendimento.id == horario_id)
    )
    horario = resultado.scalar_one_or_none()
    if not horario:
        raise ValueError("Horário não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(horario, campo, valor)
    await db.flush()
    await db.refresh(horario)
    return horario


async def deletar_horario(db: AsyncSession, horario_id: str) -> None:
    resultado = await db.execute(
        select(HorarioAtendimento).where(HorarioAtendimento.id == horario_id)
    )
    horario = resultado.scalar_one_or_none()
    if not horario:
        raise ValueError("Horário não encontrado")
    await db.delete(horario)
    await db.flush()


# ── Dias bloqueados ───────────────────────────────────────────────────────────

async def listar_dias_bloqueados(
    db: AsyncSession, apenas_ativos: bool = True
) -> Sequence[DiaBloqueado]:
    stmt = select(DiaBloqueado).order_by(DiaBloqueado.tipo, DiaBloqueado.dia_semana)
    if apenas_ativos:
        stmt = stmt.where(DiaBloqueado.ativo == True)  # noqa: E712
    resultado = await db.execute(stmt)
    return resultado.scalars().all()


async def criar_dia_bloqueado(db: AsyncSession, dados: DiaBloqueadoCreate) -> DiaBloqueado:
    novo = DiaBloqueado(**dados.model_dump())
    db.add(novo)
    await db.flush()
    await db.refresh(novo)
    return novo


async def atualizar_dia_bloqueado(
    db: AsyncSession, bloqueio_id: str, dados: DiaBloqueadoUpdate
) -> DiaBloqueado:
    resultado = await db.execute(
        select(DiaBloqueado).where(DiaBloqueado.id == bloqueio_id)
    )
    bloqueio = resultado.scalar_one_or_none()
    if not bloqueio:
        raise ValueError("Bloqueio não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(bloqueio, campo, valor)
    await db.flush()
    await db.refresh(bloqueio)
    return bloqueio


async def deletar_dia_bloqueado(db: AsyncSession, bloqueio_id: str) -> None:
    resultado = await db.execute(
        select(DiaBloqueado).where(DiaBloqueado.id == bloqueio_id)
    )
    bloqueio = resultado.scalar_one_or_none()
    if not bloqueio:
        raise ValueError("Bloqueio não encontrado")
    await db.delete(bloqueio)
    await db.flush()


# ── Verificação de data bloqueada ─────────────────────────────────────────────

def _ultimo_dia_semana_do_mes(ano: int, mes: int, dia_semana: int) -> date:
    """Retorna a data do último <dia_semana> (0=Seg…6=Dom) no mês/ano."""
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    ultimo_date = date(ano, mes, ultimo_dia)
    # Recua até encontrar o dia_semana desejado
    delta = (ultimo_date.weekday() - dia_semana) % 7
    return ultimo_date - timedelta(days=delta)


async def data_esta_bloqueada(db: AsyncSession, data: date) -> bool:
    """Verifica se uma data específica está bloqueada por alguma regra ativa."""
    dia_semana = data.weekday()

    bloqueios = await listar_dias_bloqueados(db, apenas_ativos=True)

    for b in bloqueios:
        if b.tipo == "dia_semana" and b.dia_semana == dia_semana:
            return True
        if b.tipo == "ultimo_dia_semana_mes" and b.dia_semana == dia_semana:
            ultimo = _ultimo_dia_semana_do_mes(data.year, data.month, dia_semana)
            if data == ultimo:
                return True
        if b.tipo == "data_especifica" and b.data_especifica == data:
            return True

    return False


# ── Seed de dados iniciais ────────────────────────────────────────────────────

async def seed_dados_iniciais(db: AsyncSession) -> None:
    """Popula as tabelas com os horários e bloqueios iniciais se estiverem vazias."""
    # Verifica se já existe algum horário
    count_result = await db.execute(select(HorarioAtendimento))
    if count_result.scalars().first() is not None:
        return  # já foi populado

    print("🌱 Populando horários e dias bloqueados iniciais...")

    # ── Bronze em Pé ── horários para todos os dias
    for h in [time(8, 30), time(10, 0), time(14, 0), time(16, 0)]:
        db.add(HorarioAtendimento(tipo_bronze="pe", dia_semana=None, horario=h, vagas=20))

    # ── Bronze em Pé ── horário extra nas quintas-feiras (dia_semana=3)
    db.add(HorarioAtendimento(tipo_bronze="pe", dia_semana=3, horario=time(18, 30), vagas=20))

    # ── Bronze Deitado ── horários para todos os dias
    for h in [time(8, 30), time(10, 0)]:
        db.add(HorarioAtendimento(tipo_bronze="deitado", dia_semana=None, horario=h, vagas=20))

    # ── Dias bloqueados ──
    # Todas as terças-feiras (dia_semana=1)
    db.add(DiaBloqueado(
        tipo="dia_semana",
        dia_semana=1,
        motivo="Sem atendimento às terças-feiras",
        ativo=True,
    ))
    # Último domingo do mês (dia_semana=6)
    db.add(DiaBloqueado(
        tipo="ultimo_dia_semana_mes",
        dia_semana=6,
        motivo="Último domingo do mês sem atendimento",
        ativo=True,
    ))

    await db.commit()
    print("✅ Horários e bloqueios iniciais cadastrados com sucesso!")


# ── Horários Bloqueados (slots pontuais) ──────────────────────────────────────

async def listar_horarios_bloqueados(
    db: AsyncSession, data: date | None = None
) -> Sequence[HorarioBloqueado]:
    stmt = select(HorarioBloqueado).order_by(HorarioBloqueado.data, HorarioBloqueado.horario)
    if data:
        stmt = stmt.where(HorarioBloqueado.data == data)
    resultado = await db.execute(stmt)
    return resultado.scalars().all()


async def criar_horario_bloqueado(
    db: AsyncSession, dados: HorarioBloqueadoCreate
) -> HorarioBloqueado:
    novo = HorarioBloqueado(**dados.model_dump())
    db.add(novo)
    await db.flush()
    await db.refresh(novo)
    return novo


async def deletar_horario_bloqueado(db: AsyncSession, bloqueio_id: str) -> None:
    resultado = await db.execute(
        select(HorarioBloqueado).where(HorarioBloqueado.id == bloqueio_id)
    )
    bloqueio = resultado.scalar_one_or_none()
    if not bloqueio:
        raise ValueError("Bloqueio de horário não encontrado")
    await db.delete(bloqueio)
    await db.flush()


async def slot_esta_bloqueado(
    db: AsyncSession, tipo_bronze: str, data: date, horario: time
) -> bool:
    """
    Verifica se um slot específico está bloqueado via HorarioBloqueado.
    Retorna True se há um registro que:
    - Coincide com a data
    - Tipo = None (todos) ou o tipo informado
    - Horario = None (dia inteiro) ou o horário informado
    """
    stmt = select(HorarioBloqueado).where(
        HorarioBloqueado.data == data,
        or_(
            HorarioBloqueado.tipo_bronze == None,     # noqa: E711
            HorarioBloqueado.tipo_bronze == tipo_bronze,
        ),
        or_(
            HorarioBloqueado.horario == None,         # noqa: E711  (dia inteiro)
            HorarioBloqueado.horario == horario,
        ),
    )
    resultado = await db.execute(stmt)
    return resultado.scalar_one_or_none() is not None

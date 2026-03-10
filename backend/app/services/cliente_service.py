import re
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agendamento import Agendamento
from app.schemas.cliente import ClienteOut

DIAS_INATIVO = 60  # 2 meses


def _dois_meses_atras() -> date:
    return date.today() - timedelta(days=DIAS_INATIVO)


def _normalizar_cpf(texto: str) -> str:
    """Remove máscara do CPF para comparação."""
    return re.sub(r"\D", "", texto)


async def buscar_clientes(
    db: AsyncSession,
    q: str | None = None,
    inativos_apenas: bool = False,
    limit: int = 200,
) -> list[ClienteOut]:
    """
    Retorna clientes únicos (agrupados por CPF) com dados do último agendamento.

    - q: busca livre por nome (ILIKE) ou CPF (digits only)
    - inativos_apenas: filtra quem não agenda há mais de 60 dias
    """
    dois_meses = _dois_meses_atras()
    hoje = date.today()

    # Base: agrupa por CPF e pega os dados do agendamento mais recente
    stmt = (
        select(
            Agendamento.cliente_cpf,
            func.max(Agendamento.cliente_nome).label("nome"),
            func.max(Agendamento.cliente_telefone).label("telefone"),
            func.max(Agendamento.data_agendamento).label("ultimo_agendamento"),
            func.count(Agendamento.id).label("total_agendamentos"),
        )
        .where(Agendamento.status == "confirmado")
        .group_by(Agendamento.cliente_cpf)
    )

    # Filtro de busca: aplica ANTES do agrupamento (WHERE)
    if q:
        q_stripped = _normalizar_cpf(q)
        filtros = [Agendamento.cliente_nome.ilike(f"%{q}%")]
        if q_stripped:
            filtros.append(Agendamento.cliente_cpf.like(f"%{q_stripped}%"))
        stmt = stmt.where(or_(*filtros))

    # Filtro de inativos: aplica DEPOIS do agrupamento (HAVING)
    if inativos_apenas:
        stmt = stmt.having(
            func.max(Agendamento.data_agendamento) < dois_meses
        ).order_by(func.max(Agendamento.data_agendamento).asc())  # mais antigos primeiro
    else:
        stmt = stmt.order_by(func.max(Agendamento.data_agendamento).desc())

    stmt = stmt.limit(limit)

    resultado = await db.execute(stmt)
    rows = resultado.all()

    return [
        ClienteOut(
            cpf=r.cliente_cpf,
            nome=r.nome,
            telefone=r.telefone,
            ultimo_agendamento=r.ultimo_agendamento,
            total_agendamentos=r.total_agendamentos,
            dias_sem_agendar=(hoje - r.ultimo_agendamento).days,
            inativo=r.ultimo_agendamento < dois_meses,
        )
        for r in rows
    ]

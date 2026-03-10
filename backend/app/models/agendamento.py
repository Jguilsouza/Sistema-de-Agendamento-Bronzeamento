import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, String, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Agendamento(Base):
    __tablename__ = "agendamentos"

    # ── Chave primária ────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ── Tipo de bronzeamento ──────────────────────────────────────────────────
    tipo_bronze: Mapped[str] = mapped_column(
        Enum("pe", "deitado", "carioca", name="tipo_bronze_enum", create_type=False), nullable=False
    )

    # ── Data e horário ────────────────────────────────────────────────────────
    data_agendamento: Mapped[date] = mapped_column(Date, nullable=False)
    horario_agendamento: Mapped[time] = mapped_column(Time, nullable=False)

    # ── Dados do cliente ──────────────────────────────────────────────────────
    cliente_nome: Mapped[str] = mapped_column(String(150), nullable=False)
    cliente_telefone: Mapped[str] = mapped_column(String(20), nullable=False)
    cliente_cpf: Mapped[str] = mapped_column(String(14), nullable=False)

    # ── Metadata ──────────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        Enum("confirmado", "cancelado", name="status_enum"),
        nullable=False,
        default="confirmado",
    )
    presenca_confirmada: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    forma_pagamento: Mapped[str | None] = mapped_column(
        String(10), nullable=True, default=None
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Restrição de unicidade ────────────────────────────────────────────────
    # Um mesmo CPF não pode ter dois agendamentos ativos no mesmo dia/horário/serviço
    __table_args__ = (
        UniqueConstraint(
            "cliente_cpf",
            "tipo_bronze",
            "data_agendamento",
            "horario_agendamento",
            name="uq_cpf_agendamento",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Agendamento id={self.id} tipo={self.tipo_bronze} "
            f"data={self.data_agendamento} hora={self.horario_agendamento} "
            f"cliente={self.cliente_nome}>"
        )

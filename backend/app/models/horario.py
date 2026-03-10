import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, SmallInteger, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base



class HorarioAtendimento(Base):
    """
    Define os horários disponíveis por tipo de bronzeamento.

    dia_semana: 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo
                None = aplica a TODOS os dias da semana
    """
    __tablename__ = "horarios_atendimento"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tipo_bronze: Mapped[str] = mapped_column(
        Enum("pe", "deitado", "carioca", name="tipo_bronze_enum", create_type=False), nullable=False
    )
    # None = todos os dias; 0–6 = dia específico da semana
    dia_semana: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    horario: Mapped[time] = mapped_column(Time, nullable=False)
    vagas: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        dia = f"dia={self.dia_semana}" if self.dia_semana is not None else "todos os dias"
        return f"<HorarioAtendimento tipo={self.tipo_bronze} {dia} hora={self.horario} vagas={self.vagas}>"


class DiaBloqueado(Base):
    """
    Define dias sem atendimento — pode ser recorrente (por dia da semana)
    ou pontual (data específica).

    tipo:
      'dia_semana'           → bloqueia TODOS os dias daquele dia_semana (ex: todas as terças)
      'ultimo_dia_semana_mes'→ bloqueia o último <dia_semana> de cada mês (ex: último domingo)
      'data_especifica'      → bloqueia uma data específica (feriado, etc.)
    """
    __tablename__ = "dias_bloqueados"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tipo: Mapped[str] = mapped_column(
        Enum(
            "dia_semana",
            "ultimo_dia_semana_mes",
            "data_especifica",
            name="tipo_bloqueio_enum",
        ),
        nullable=False,
    )
    # Usado por 'dia_semana' e 'ultimo_dia_semana_mes'
    dia_semana: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Usado por 'data_especifica'
    data_especifica: Mapped[date | None] = mapped_column(Date, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<DiaBloqueado tipo={self.tipo} dia={self.dia_semana} data={self.data_especifica}>"


class HorarioBloqueado(Base):
    """
    Bloqueia slots específicos em uma data específica (criado pelo admin).

    tipo_bronze = None  → bloqueia todos os tipos para aquela data/horário
    horario = None      → bloqueia o dia inteiro (para o tipo_bronze ou todos)
    """
    __tablename__ = "horarios_bloqueados"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    tipo_bronze: Mapped[str | None] = mapped_column(
        Enum("pe", "deitado", "carioca", name="tipo_bronze_enum", create_type=False), nullable=True
    )
    # None = bloqueia o dia inteiro; hora específica = bloqueia só aquele slot
    horario: Mapped[time | None] = mapped_column(Time, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<HorarioBloqueado data={self.data} tipo={self.tipo_bronze} hora={self.horario}>"

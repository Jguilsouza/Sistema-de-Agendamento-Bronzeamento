from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

DIAS_SEMANA = {0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta",
               4: "Sexta", 5: "Sábado", 6: "Domingo"}


# ── HorarioAtendimento ────────────────────────────────────────────────────────

class HorarioAtendimentoCreate(BaseModel):
    tipo_bronze: str = Field(..., pattern="^(pe|deitado|carioca)$")
    dia_semana: int | None = Field(None, ge=0, le=6,
        description="0=Seg, 1=Ter, 2=Qua, 3=Qui, 4=Sex, 5=Sáb, 6=Dom. null=todos os dias")
    horario: time
    vagas: int = Field(20, ge=1, le=100)
    ativo: bool = True


class HorarioAtendimentoUpdate(BaseModel):
    dia_semana: int | None = Field(None, ge=0, le=6)
    horario: time | None = None
    vagas: int | None = Field(None, ge=1, le=100)
    ativo: bool | None = None


class HorarioAtendimentoOut(BaseModel):
    id: UUID
    tipo_bronze: str
    dia_semana: int | None
    dia_semana_nome: str | None = None
    horario: time
    vagas: int
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_dia_nome(self) -> "HorarioAtendimentoOut":
        if self.dia_semana is not None:
            self.dia_semana_nome = DIAS_SEMANA.get(self.dia_semana, str(self.dia_semana))
        else:
            self.dia_semana_nome = "Todos os dias"
        return self


# ── DiaBloqueado ──────────────────────────────────────────────────────────────

class DiaBloqueadoCreate(BaseModel):
    tipo: str = Field(..., pattern="^(dia_semana|ultimo_dia_semana_mes|data_especifica)$")
    dia_semana: int | None = Field(None, ge=0, le=6)
    data_especifica: date | None = None
    motivo: str | None = Field(None, max_length=200)
    ativo: bool = True

    @model_validator(mode="after")
    def validar_campos(self) -> "DiaBloqueadoCreate":
        if self.tipo in ("dia_semana", "ultimo_dia_semana_mes") and self.dia_semana is None:
            raise ValueError("dia_semana é obrigatório para este tipo de bloqueio")
        if self.tipo == "data_especifica" and self.data_especifica is None:
            raise ValueError("data_especifica é obrigatória para este tipo de bloqueio")
        return self


class DiaBloqueadoUpdate(BaseModel):
    motivo: str | None = Field(None, max_length=200)
    ativo: bool | None = None


class DiaBloqueadoOut(BaseModel):
    id: UUID
    tipo: str
    dia_semana: int | None
    dia_semana_nome: str | None = None
    data_especifica: date | None
    motivo: str | None
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_dia_nome(self) -> "DiaBloqueadoOut":
        if self.dia_semana is not None:
            self.dia_semana_nome = DIAS_SEMANA.get(self.dia_semana)
        return self


# ── HorarioBloqueado (slots pontuais bloqueados pelo admin) ───────────────────

class HorarioBloqueadoCreate(BaseModel):
    data: date
    tipo_bronze: Optional[str] = Field(None, pattern="^(pe|deitado|carioca)$",
        description="Deixe vazio para bloquear todos os tipos")
    horario: Optional[time] = Field(None,
        description="Deixe vazio para bloquear o dia inteiro")
    motivo: Optional[str] = Field(None, max_length=200)


class HorarioBloqueadoOut(BaseModel):
    id: UUID
    data: date
    tipo_bronze: Optional[str]
    horario: Optional[time]
    motivo: Optional[str]
    criado_em: datetime

    model_config = {"from_attributes": True}

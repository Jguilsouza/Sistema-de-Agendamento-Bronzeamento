from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, Field, field_validator
import re


# ── Fuso horário Brasil (UTC-3) ───────────────────────────────────────────────
from datetime import timezone, timedelta
FUSO_BRASIL = timezone(timedelta(hours=-3))


# ── Helpers ───────────────────────────────────────────────────────────────────

def validar_cpf(cpf: str) -> str:
    """Valida CPF usando o algoritmo oficial brasileiro."""
    cpf_limpo = re.sub(r"[^0-9]", "", cpf)

    if len(cpf_limpo) != 11:
        raise ValueError("CPF deve conter 11 dígitos")

    # Rejeita sequências repetidas (ex: 111.111.111-11)
    if len(set(cpf_limpo)) == 1:
        raise ValueError("CPF inválido")

    # Validação do 1º dígito verificador
    soma = sum(int(cpf_limpo[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    if resto in (10, 11):
        resto = 0
    if resto != int(cpf_limpo[9]):
        raise ValueError("CPF inválido")

    # Validação do 2º dígito verificador
    soma = sum(int(cpf_limpo[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    if resto in (10, 11):
        resto = 0
    if resto != int(cpf_limpo[10]):
        raise ValueError("CPF inválido")

    return cpf_limpo


def validar_telefone(tel: str) -> str:
    tel_limpo = re.sub(r"[^0-9]", "", tel)
    if len(tel_limpo) != 11:
        raise ValueError("Telefone deve ter DDD (2 dígitos) + 9 dígitos do celular")
    return tel_limpo


# ── Schemas de entrada ────────────────────────────────────────────────────────

class AgendamentoCreate(BaseModel):
    tipo_bronze: str = Field(..., pattern="^(pe|deitado|carioca)$", description="'pe', 'deitado' ou 'carioca'")
    data_agendamento: date
    horario_agendamento: time
    cliente_nome: str = Field(..., min_length=3, max_length=150)
    cliente_telefone: str
    cliente_cpf: str

    @field_validator("cliente_cpf")
    @classmethod
    def check_cpf(cls, v: str) -> str:
        return validar_cpf(v)

    @field_validator("cliente_telefone")
    @classmethod
    def check_telefone(cls, v: str) -> str:
        return validar_telefone(v)

    @field_validator("data_agendamento")
    @classmethod
    def check_data_futura(cls, v: date) -> date:
        agora = datetime.now(FUSO_BRASIL).date()
        if v < agora:
            raise ValueError("A data de agendamento não pode ser no passado")
        return v


class AgendamentoUpdate(BaseModel):
    """Schema para atualização parcial (admin)."""
    status: str | None = Field(None, pattern="^(confirmado|cancelado)$")
    horario_agendamento: time | None = None
    data_agendamento: date | None = None


class ConfirmarPresencaRequest(BaseModel):
    """Confirmação de presença e forma de pagamento pelo admin."""
    forma_pagamento: str = Field(..., pattern="^(cartao|dinheiro|pix)$",
                                 description="'cartao', 'dinheiro' ou 'pix'")


class ReagendamentoRequest(BaseModel):
    """Reagendamento pelo cliente via CPF."""
    cpf: str
    nova_data: date
    novo_horario: time

    @field_validator("cpf")
    @classmethod
    def check_cpf(cls, v: str) -> str:
        return validar_cpf(v)

    @field_validator("nova_data")
    @classmethod
    def check_data_futura(cls, v: date) -> date:
        agora = datetime.now(FUSO_BRASIL).date()
        if v < agora:
            raise ValueError("A nova data não pode ser no passado")
        return v


class CancelamentoClienteRequest(BaseModel):
    cpf: str

    @field_validator("cpf")
    @classmethod
    def check_cpf(cls, v: str) -> str:
        return validar_cpf(v)


# ── Schemas de saída ──────────────────────────────────────────────────────────

class AgendamentoOut(BaseModel):
    id: UUID
    tipo_bronze: str
    data_agendamento: date
    horario_agendamento: time
    cliente_nome: str
    cliente_telefone: str
    cliente_cpf: str
    status: str
    presenca_confirmada: bool = False
    forma_pagamento: str | None = None
    criado_em: datetime

    model_config = {"from_attributes": True}


class AgendamentoPublicOut(BaseModel):
    """Retorno público – sem dados sensíveis do cliente."""
    id: UUID
    tipo_bronze: str
    data_agendamento: date
    horario_agendamento: time
    status: str
    criado_em: datetime

    model_config = {"from_attributes": True}


class AgendamentoClienteOut(BaseModel):
    """Retorno para consulta do cliente com info de reagendamento."""
    id: UUID
    tipo_bronze: str
    data_agendamento: date
    horario_agendamento: time
    cliente_nome: str
    status: str
    pode_reagendar: bool = False  # True se faltam >24h
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Schemas de disponibilidade ────────────────────────────────────────────────

class HorarioDisponivel(BaseModel):
    horario: time
    vagas_disponiveis: int
    vagas_total: int


class DisponibilidadeOut(BaseModel):
    tipo_bronze: str
    data: date
    horarios: list[HorarioDisponivel]
    dia_bloqueado: bool = False

from datetime import date
from pydantic import BaseModel


class ClienteOut(BaseModel):
    cpf: str
    nome: str
    telefone: str
    ultimo_agendamento: date
    total_agendamentos: int
    dias_sem_agendar: int
    inativo: bool  # True se > 60 dias sem agendar

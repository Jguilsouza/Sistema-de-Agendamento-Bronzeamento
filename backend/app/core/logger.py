"""
Configuração centralizada de logging – Iluminada Bronze API
-----------------------------------------------------------
Formato:  TIMESTAMP | LEVEL    | módulo               | mensagem
Exemplo:  2026-03-09 14:23:01 | INFO     | services.agendamento | Agendamento criado [id=abc123 tipo=pe data=2026-03-11 horario=08:30]

Variável de ambiente:
  LOG_LEVEL  – DEBUG | INFO | WARNING | ERROR  (padrão: INFO)
"""

import logging
import sys
from app.core.config import get_settings

# ── Formato dos logs ──────────────────────────────────────────────────────────
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-35s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging() -> None:
    """Configura o logger raiz da aplicação. Deve ser chamado uma única vez no startup."""
    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Handler para stdout (Railway/Render/Heroku capturam stdout)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT))

    root = logging.getLogger()
    root.setLevel(level)

    # Evita handlers duplicados em hot-reload do uvicorn
    if not root.handlers:
        root.addHandler(handler)
    else:
        root.handlers.clear()
        root.addHandler(handler)

    # Reduz verbosidade de bibliotecas externas em produção
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if level == logging.DEBUG else logging.WARNING
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # evita duplicar request logs
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Retorna um logger nomeado para o módulo informado."""
    return logging.getLogger(name)


# ── Helpers de mascaramento de dados sensíveis ────────────────────────────────

def mask_cpf(cpf: str) -> str:
    """Exibe apenas primeiros 3 e últimos 2 dígitos. Ex: 123.***.***-47"""
    digits = "".join(c for c in cpf if c.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}.***.***.{digits[-2:]}"
    return "***.***.***-**"


def mask_phone(phone: str) -> str:
    """Exibe DDD e últimos 4 dígitos. Ex: (27)****-8956"""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) >= 10:
        return f"({digits[:2]})****-{digits[-4:]}"
    return "(**)**-****"

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/iluminada_bronze"

    # JWT / Auth
    SECRET_KEY: str = "mude-essa-chave-para-producao"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 horas

    # Admin credentials (fallback caso não use Supabase Auth)
    ADMIN_EMAIL: str = "admin@iluminadabronze.com"
    ADMIN_PASSWORD: str = "troque-esta-senha"

    # CORS – adicione o domínio do front em produção
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8080",
        "*",  # remova em produção e liste os domínios explicitamente
    ]

    # Limite de vagas por horário
    MAX_VAGAS_POR_HORARIO: int = 20

    # Logging – use DEBUG localmente, INFO em produção
    LOG_LEVEL: str = "INFO"  # DEBUG | INFO | WARNING | ERROR

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

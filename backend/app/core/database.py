from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()


_connect_args: dict = {}
if "supabase.com" in settings.DATABASE_URL or "neon.tech" in settings.DATABASE_URL:
    _connect_args = {
        "ssl": "require",
        "statement_cache_size": 0,  # necessário para o Transaction Pooler (porta 6543)
    }

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    """Dependency para injeção de sessão nas rotas."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_all_tables() -> None:
    """Cria todas as tabelas no banco (usado no startup da aplicação)."""
    async with engine.begin() as conn:
        from app.models import agendamento  # noqa: F401 – importa para registrar os modelos
        await conn.run_sync(Base.metadata.create_all)

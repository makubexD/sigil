import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import Boolean, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://app:app@localhost:5432/app")
BILLING_PLANS_URL = os.environ.get("BILLING_PLANS_URL", "http://billing.internal/plans")
# The billing service can take up to ~2s to answer; leave headroom above that.
BILLING_TIMEOUT_SECONDS = float(os.environ.get("BILLING_TIMEOUT_SECONDS", "3"))


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


# Pool sized for the DB work only: connections are held for milliseconds,
# because the billing call happens after the session is closed.
engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class PublicProfile(BaseModel):
    id: int
    display_name: str
    plan: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One shared client keeps connections to billing pooled. The limit is sized for
    # ~300 rps * 2s in-flight billing calls, with headroom.
    limits = httpx.Limits(max_connections=1000, max_keepalive_connections=200)
    async with httpx.AsyncClient(timeout=BILLING_TIMEOUT_SECONDS, limits=limits) as client:
        app.state.billing = client
        yield
    await engine.dispose()


app = FastAPI(title="User profiles", lifespan=lifespan)


async def fetch_plan(client: httpx.AsyncClient, user_id: int) -> str:
    try:
        response = await client.get(f"{BILLING_PLANS_URL}/{user_id}")
        response.raise_for_status()
        return str(response.json()["plan"])
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plan service unavailable",
        ) from exc


@app.get("/users/{user_id}/profile", response_model=PublicProfile)
async def get_user_profile(user_id: int, request: Request) -> PublicProfile:
    # Select only public columns, so password_hash and email never leave the database.
    async with SessionLocal() as session:  # type: AsyncSession
        row = (
            await session.execute(
                select(User.id, User.display_name).where(User.id == user_id)
            )
        ).one_or_none()

    # The DB connection is back in the pool here, before the slow billing call.
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    plan = await fetch_plan(request.app.state.billing, user_id)
    return PublicProfile(id=row.id, display_name=row.display_name, plan=plan)

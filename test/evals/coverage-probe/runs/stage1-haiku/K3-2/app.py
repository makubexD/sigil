import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, String, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/app"
)
BILLING_BASE_URL = os.environ.get("BILLING_BASE_URL", "http://billing.internal")
# The billing service can take up to 2s to answer; leave some headroom above that.
BILLING_TIMEOUT_SECONDS = float(os.environ.get("BILLING_TIMEOUT_SECONDS", "2.5"))

logger = logging.getLogger(__name__)

engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


class PublicProfile(BaseModel):
    id: int
    display_name: str
    plan: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One shared client gives us connection pooling for the billing calls.
    # The limit is sized for a few hundred req/s with a ~2s billing latency.
    app.state.billing = httpx.AsyncClient(
        base_url=BILLING_BASE_URL,
        timeout=httpx.Timeout(BILLING_TIMEOUT_SECONDS, connect=0.5),
        limits=httpx.Limits(max_connections=1000, max_keepalive_connections=200),
    )
    try:
        yield
    finally:
        await app.state.billing.aclose()
        await engine.dispose()


app = FastAPI(title="User profiles", lifespan=lifespan)


async def fetch_plan(client: httpx.AsyncClient, user_id: int) -> str:
    try:
        response = await client.get(f"/plans/{user_id}")
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("billing lookup failed for user %s: %s", user_id, exc)
        raise HTTPException(status_code=503, detail="Billing service unavailable") from exc
    return response.json()["plan"]


@app.get("/users/{user_id}/profile", response_model=PublicProfile)
async def get_user_profile(user_id: int, request: Request) -> PublicProfile:
    # Read only the columns we need and release the connection before calling billing.
    # Holding a DB connection for up to 2s per request would exhaust the pool quickly.
    async with SessionLocal() as session:
        row = (
            await session.execute(
                select(User.id, User.display_name).where(User.id == user_id)
            )
        ).one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    plan = await fetch_plan(request.app.state.billing, user_id)
    return PublicProfile(id=row.id, display_name=row.display_name, plan=plan)

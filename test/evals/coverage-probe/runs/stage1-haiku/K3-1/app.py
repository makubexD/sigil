import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import String
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://localhost/app")
BILLING_BASE_URL = os.environ.get("BILLING_BASE_URL", "http://billing.internal")

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(default=False)


engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One shared client so billing calls reuse connections. Billing can take up to
    # ~2s, so the connection limit is sized for several hundred in-flight requests.
    async with httpx.AsyncClient(
        base_url=BILLING_BASE_URL,
        timeout=httpx.Timeout(3.0, connect=1.0),
        limits=httpx.Limits(max_connections=1000, max_keepalive_connections=200),
    ) as billing:
        app.state.billing = billing
        yield
    await engine.dispose()


app = FastAPI(title="Users API", lifespan=lifespan)


class PublicProfile(BaseModel):
    id: int
    display_name: str
    # None when the billing service is slow or failing; the profile is still served.
    plan: Any | None


async def fetch_plan(billing: httpx.AsyncClient, user_id: int) -> Any | None:
    try:
        response = await billing.get(f"/plans/{user_id}")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        logger.warning("Billing lookup failed for user %s", user_id, exc_info=True)
        return None


@app.get("/users/{user_id}/profile", response_model=PublicProfile)
async def get_user_profile(user_id: int, request: Request) -> PublicProfile:
    # Release the DB connection before calling billing, so slow billing responses
    # don't pin pooled connections.
    async with SessionLocal() as session:
        user = await session.get(User, user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    plan = await fetch_plan(request.app.state.billing, user_id)
    return PublicProfile(id=user.id, display_name=user.display_name, plan=plan)

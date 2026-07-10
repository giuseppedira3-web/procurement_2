import asyncpg
from fastapi import Request


async def init_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn, min_size=2, max_size=10)


async def get_conn(request: Request):
    async with request.app.state.pool.acquire() as conn:
        yield conn

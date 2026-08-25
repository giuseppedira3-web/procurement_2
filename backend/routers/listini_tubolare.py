from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from database import get_conn
from schemas import (
    ListinoTubolareCreate,
    ListinoTubolareResponse,
    ListinoTubolarePrezzoUpsert,
    ListinoTubolarePrezzoResponse,
)

router = APIRouter(prefix="/listini-tubolare", tags=["Listini Tubolare"])


@router.get("/", response_model=list[ListinoTubolareResponse])
async def list_listini_tubolare(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("SELECT * FROM listini_tubolare ORDER BY id DESC")
    return [dict(r) for r in rows]


@router.post("/", response_model=ListinoTubolareResponse, status_code=201)
async def create_listino_tubolare(body: ListinoTubolareCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            "INSERT INTO listini_tubolare (nome) VALUES ($1) RETURNING *",
            body.nome,
        )
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    return dict(row)


@router.get("/{id}/prezzi/", response_model=list[ListinoTubolarePrezzoResponse])
async def get_prezzi_listino_tubolare(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    listino = await conn.fetchrow("SELECT id FROM listini_tubolare WHERE id = $1", id)
    if not listino:
        raise HTTPException(404, "Listino non trovato")
    rows = await conn.fetch(
        "SELECT id_prodotto, qualita, prezzo FROM listino_tubolare_prezzi WHERE id_listino = $1",
        id,
    )
    return [dict(r) for r in rows]


@router.post("/{id}/prezzi/", response_model=ListinoTubolarePrezzoResponse, status_code=201)
async def set_prezzo_listino_tubolare(id: int, body: ListinoTubolarePrezzoUpsert, conn: asyncpg.Connection = Depends(get_conn)):
    listino = await conn.fetchrow("SELECT id FROM listini_tubolare WHERE id = $1", id)
    if not listino:
        raise HTTPException(404, "Listino non trovato")
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO listino_tubolare_prezzi (id_listino, id_prodotto, qualita, prezzo)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id_listino, id_prodotto, qualita)
            DO UPDATE SET prezzo = $4, updated_at = now()
            RETURNING id_prodotto, qualita, prezzo
            """,
            id, body.id_prodotto, body.qualita, body.prezzo,
        )
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)

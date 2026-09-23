from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from database import get_conn
from schemas import (
    ListinoLamieraProduttoreUpdate, ListinoLamieraProduttoreResponse,
    ListinoLamieraExtraSpessoreUpdate, ListinoLamieraExtraSpessoreResponse,
    ListinoLamieraExtraQualitaUpdate, ListinoLamieraExtraQualitaResponse,
)

router = APIRouter(prefix="/listino-lamiera-produttori", tags=["Listino Lamiera Produttori"])


@router.get("/", response_model=list[ListinoLamieraProduttoreResponse])
async def list_listino_lamiera_produttori(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("SELECT * FROM listino_lamiera_produttori ORDER BY id")
    return [dict(r) for r in rows]


@router.patch("/{id}", response_model=ListinoLamieraProduttoreResponse)
async def update_listino_lamiera_produttore(
    id: int, body: ListinoLamieraProduttoreUpdate, conn: asyncpg.Connection = Depends(get_conn)
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE listino_lamiera_produttori SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.get("/{id}/extra-spessore/", response_model=list[ListinoLamieraExtraSpessoreResponse])
async def list_extra_spessore(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch(
        "SELECT * FROM listino_lamiera_extra_spessore WHERE id_produttore = $1 ORDER BY tipologia, ordine",
        id,
    )
    return [dict(r) for r in rows]


@router.patch("/extra-spessore/{id}", response_model=ListinoLamieraExtraSpessoreResponse)
async def update_extra_spessore(
    id: int, body: ListinoLamieraExtraSpessoreUpdate, conn: asyncpg.Connection = Depends(get_conn)
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE listino_lamiera_extra_spessore SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.get("/{id}/extra-qualita/", response_model=list[ListinoLamieraExtraQualitaResponse])
async def list_extra_qualita(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch(
        "SELECT * FROM listino_lamiera_extra_qualita WHERE id_produttore = $1 ORDER BY tipologia, ordine",
        id,
    )
    return [dict(r) for r in rows]


@router.patch("/extra-qualita/{id}", response_model=ListinoLamieraExtraQualitaResponse)
async def update_extra_qualita(
    id: int, body: ListinoLamieraExtraQualitaUpdate, conn: asyncpg.Connection = Depends(get_conn)
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE listino_lamiera_extra_qualita SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.post("/extra-qualita/{id}/seleziona", response_model=ListinoLamieraExtraQualitaResponse)
async def seleziona_extra_qualita(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    """La qualità non è deducibile dal codice prodotto (a differenza dello
    spessore): l'utente ne seleziona una sola, che diventa quella applicata
    a tutti i codici della stessa tipologia/produttore — da qui la mutua
    esclusione entro (id_produttore, tipologia)."""
    async with conn.transaction():
        riga = await conn.fetchrow(
            "SELECT id_produttore, tipologia FROM listino_lamiera_extra_qualita WHERE id = $1", id
        )
        if not riga:
            raise HTTPException(404)
        await conn.execute(
            "UPDATE listino_lamiera_extra_qualita SET selezionata = false WHERE id_produttore = $1 AND tipologia = $2",
            riga["id_produttore"], riga["tipologia"],
        )
        row = await conn.fetchrow(
            "UPDATE listino_lamiera_extra_qualita SET selezionata = true WHERE id = $1 RETURNING *", id
        )
    return dict(row)

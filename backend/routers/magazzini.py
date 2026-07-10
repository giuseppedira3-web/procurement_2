from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from database import get_conn
from schemas import MagazzinoFornitoreCreate, MagazzinoFornitoreUpdate, MagazzinoFornitoreResponse

router = APIRouter(prefix="/fornitori/{id_fornitore}/magazzini", tags=["Magazzini Fornitore"])


@router.get("/", response_model=list[MagazzinoFornitoreResponse])
async def list_magazzini(id_fornitore: int, conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch(
        "SELECT * FROM magazzini_fornitore WHERE id_fornitore = $1 ORDER BY comune",
        id_fornitore,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=MagazzinoFornitoreResponse, status_code=201)
async def create_magazzino(
    id_fornitore: int,
    body: MagazzinoFornitoreCreate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    if not await conn.fetchval("SELECT id FROM fornitori WHERE id = $1", id_fornitore):
        raise HTTPException(404, "Fornitore non trovato")
    row = await conn.fetchrow(
        """INSERT INTO magazzini_fornitore (id_fornitore, comune, indirizzo, note, attivo)
           VALUES ($1,$2,$3,$4,$5) RETURNING *""",
        id_fornitore, body.comune, body.indirizzo, body.note, body.attivo,
    )
    return dict(row)


@router.patch("/{mid}", response_model=MagazzinoFornitoreResponse)
async def update_magazzino(
    id_fornitore: int,
    mid: int,
    body: MagazzinoFornitoreUpdate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    n = len(updates)
    row = await conn.fetchrow(
        f"UPDATE magazzini_fornitore SET {sets} WHERE id = $1 AND id_fornitore = ${n+2} RETURNING *",
        mid, *updates.values(), id_fornitore,
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{mid}", status_code=204)
async def delete_magazzino(
    id_fornitore: int,
    mid: int,
    conn: asyncpg.Connection = Depends(get_conn),
):
    result = await conn.execute(
        "DELETE FROM magazzini_fornitore WHERE id = $1 AND id_fornitore = $2",
        mid, id_fornitore,
    )
    if result == "DELETE 0":
        raise HTTPException(404)

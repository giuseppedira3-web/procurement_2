from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from schemas import VettoreCreate, VettoreUpdate, VettoreResponse

router = APIRouter(prefix="/vettori", tags=["Vettori"])


@router.get("/", response_model=list[VettoreResponse])
async def list_vettori(
    attivo: bool | None = None,
    limit: int = Query(200, le=1000),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if attivo is not None:
        params.append(attivo)
        filters.append(f"attivo = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params.append(limit)
    rows = await conn.fetch(
        f"SELECT * FROM vettori {where} ORDER BY ragione_sociale LIMIT ${len(params)}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=VettoreResponse, status_code=201)
async def create_vettore(body: VettoreCreate, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        "INSERT INTO vettori (ragione_sociale, telefono, email, note, attivo) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        body.ragione_sociale, body.telefono, body.email, body.note, body.attivo,
    )
    return dict(row)


@router.get("/{id}", response_model=VettoreResponse)
async def get_vettore(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM vettori WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=VettoreResponse)
async def update_vettore(id: int, body: VettoreUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE vettori SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_vettore(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM vettori WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

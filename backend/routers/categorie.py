from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from schemas import CategoriaCreate, CategoriaUpdate, CategoriaResponse

router = APIRouter(prefix="/categorie", tags=["Categorie Prodotto"])


@router.get("/", response_model=list[CategoriaResponse])
async def list_categorie(
    tipo_prezzo: str | None = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if tipo_prezzo:
        params.append(tipo_prezzo)
        filters.append(f"tipo_prezzo = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM categorie_prodotto {where} ORDER BY codice LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=CategoriaResponse, status_code=201)
async def create_categoria(body: CategoriaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO categorie_prodotto (codice, descrizione, tipo_prezzo, unita_misura_base, note, parametro_prezzo)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            """,
            body.codice, body.descrizione, body.tipo_prezzo, body.unita_misura_base, body.note, body.parametro_prezzo,
        )
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    except asyncpg.CheckViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/{id}", response_model=CategoriaResponse)
async def get_categoria(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM categorie_prodotto WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=CategoriaResponse)
async def update_categoria(id: int, body: CategoriaUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE categorie_prodotto SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.CheckViolationError as e:
        raise HTTPException(422, detail=str(e))
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_categoria(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM categorie_prodotto WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

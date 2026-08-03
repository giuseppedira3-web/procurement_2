from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from schemas import ListinoCreate, ListinoUpdate, ListinoResponse

router = APIRouter(prefix="/listino", tags=["Listino Prezzi"])


@router.get("/", response_model=list[ListinoResponse])
async def list_listino(
    id_fornitore: int | None = None,
    id_prodotto: int | None = None,
    id_categoria: int | None = None,
    tipo: str | None = None,
    attivo: bool | None = None,
    data_riferimento: date | None = Query(None, description="Filtra voci valide a questa data"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    if id_prodotto is not None:
        params.append(id_prodotto)
        filters.append(f"id_prodotto = ${len(params)}")
    if id_categoria is not None:
        params.append(id_categoria)
        filters.append(f"id_categoria = ${len(params)}")
    if tipo:
        params.append(tipo)
        filters.append(f"tipo = ${len(params)}")
    if attivo is not None:
        params.append(attivo)
        filters.append(f"attivo = ${len(params)}")
    if data_riferimento:
        params.append(data_riferimento)
        filters.append(
            f"data_inizio <= ${len(params)} AND (data_fine IS NULL OR data_fine >= ${len(params)})"
        )
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM listino_prezzi {where} ORDER BY id_fornitore, data_inizio DESC LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=ListinoResponse, status_code=201)
async def create_listino(body: ListinoCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO listino_prezzi (
                id_fornitore, id_prodotto, id_categoria, tipo,
                prezzo_unitario, valuta, unita_misura_prezzo,
                data_inizio, data_fine, attivo, note
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
            """,
            body.id_fornitore, body.id_prodotto, body.id_categoria, body.tipo,
            body.prezzo_unitario, body.valuta, body.unita_misura_prezzo,
            body.data_inizio, body.data_fine, body.attivo, body.note,
        )
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/{id}", response_model=ListinoResponse)
async def get_listino(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM listino_prezzi WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=ListinoResponse)
async def update_listino(id: int, body: ListinoUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE listino_prezzi SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_listino(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM listino_prezzi WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

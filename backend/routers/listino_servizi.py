from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from schemas import ListinoServizioCreate, ListinoServizioUpdate, ListinoServizioResponse

router = APIRouter(prefix="/listino-servizi", tags=["Listino Servizi"])


@router.get("/", response_model=list[ListinoServizioResponse])
async def list_listino_servizi(
    id_fornitore: int | None = None,
    id_categoria_servizio: int | None = None,
    id_categoria_prodotto: int | None = None,
    localita_origine: str | None = None,
    localita_destinazione: str | None = None,
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
    if id_categoria_servizio is not None:
        params.append(id_categoria_servizio)
        filters.append(f"id_categoria_servizio = ${len(params)}")
    if id_categoria_prodotto is not None:
        params.append(id_categoria_prodotto)
        filters.append(f"id_categoria_prodotto = ${len(params)}")
    if localita_origine:
        params.append(localita_origine)
        filters.append(f"localita_origine ILIKE ${len(params)}")
    if localita_destinazione:
        params.append(localita_destinazione)
        filters.append(f"localita_destinazione ILIKE ${len(params)}")
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
        f"SELECT * FROM listino_servizi {where} ORDER BY id_categoria_servizio, id_fornitore, data_inizio DESC LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=ListinoServizioResponse, status_code=201)
async def create_listino_servizio(body: ListinoServizioCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO listino_servizi (
                id_fornitore, id_vettore, id_categoria_servizio,
                localita_origine, localita_destinazione,
                id_categoria_prodotto, descrizione_voce,
                parametro_rif, parametro_min, parametro_max,
                prezzo_unitario, valuta, unita_misura_prezzo,
                data_inizio, data_fine, attivo, note
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *
            """,
            body.id_fornitore, body.id_vettore, body.id_categoria_servizio,
            body.localita_origine, body.localita_destinazione,
            body.id_categoria_prodotto, body.descrizione_voce,
            body.parametro_rif, body.parametro_min, body.parametro_max,
            body.prezzo_unitario, body.valuta, body.unita_misura_prezzo,
            body.data_inizio, body.data_fine, body.attivo, body.note,
        )
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/{id}", response_model=ListinoServizioResponse)
async def get_listino_servizio(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM listino_servizi WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=ListinoServizioResponse)
async def update_listino_servizio(id: int, body: ListinoServizioUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE listino_servizi SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_listino_servizio(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM listino_servizi WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

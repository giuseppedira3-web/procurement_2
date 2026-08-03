from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from codici import genera_codice
from schemas import (
    DdtCreate, DdtUpdate, DdtResponse, DdtConRighe,
    DdtRigaCreate, DdtRigaUpdate, DdtRigaResponse,
)

router = APIRouter(prefix="/ddt", tags=["DDT"])


# ---------------------------------------------------------------------------
# Testata DDT
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[DdtResponse])
async def list_ddt(
    id_fornitore: int | None = None,
    stato: str | None = None,
    ditta: str | None = None,
    fatturato: bool | None = Query(None, description="Filtra DDT completamente fatturati o no"),
    q: str | None = Query(None, description="Cerca per codice o numero DDT fornitore"),
    limit: int = Query(50, le=1000),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"ditta = ${len(params)}")
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    if stato:
        params.append(stato)
        filters.append(f"stato = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        filters.append(f"(codice_ddt ILIKE ${len(params)} OR numero_ddt_fornitore ILIKE ${len(params)})")
    if fatturato is not None:
        if fatturato:
            filters.append("stato = 'fatturato'")
        else:
            filters.append("stato != 'fatturato'")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"""SELECT d.*, v.ragione_sociale AS nome_vettore, io.tipi_ordine
            FROM ddt d
            LEFT JOIN vettori v ON v.id = d.id_vettore
            LEFT JOIN LATERAL (
                SELECT array_agg(DISTINCT o.incoterm) AS tipi_ordine
                FROM ddt_righe dr
                JOIN ordini o ON o.id = dr.id_ordine
                WHERE dr.id_ddt = d.id AND o.incoterm IS NOT NULL
            ) io ON true
            {where} ORDER BY d.data_ddt DESC LIMIT ${n-1} OFFSET ${n}""",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=DdtConRighe, status_code=201)
async def create_ddt(body: DdtCreate, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        try:
            codice, _, _ = await genera_codice(conn, "ddt", body.id_fornitore)
        except ValueError as e:
            raise HTTPException(422, detail=str(e))
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO ddt (
                    codice_ddt, id_fornitore, numero_ddt_fornitore,
                    data_ddt, data_ricezione,
                    numero_colli, peso_lordo_kg, peso_netto_kg,
                    id_vettore, targa, costo_trasporto, stato, ditta, note
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                RETURNING *
                """,
                codice, body.id_fornitore, body.numero_ddt_fornitore,
                body.data_ddt, body.data_ricezione,
                body.numero_colli, body.peso_lordo_kg, body.peso_netto_kg,
                body.id_vettore, body.targa, body.costo_trasporto, body.stato, body.ditta, body.note,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "DDT già presente per questo fornitore con questo numero")
        except asyncpg.ForeignKeyViolationError as e:
            raise HTTPException(422, detail=str(e))
    result = dict(row)
    result["righe"] = []
    return result


@router.get("/all-righe")
async def list_all_righe_ddt(
    id_fornitore: int | None = None,
    fatturato: bool | None = None,
    ditta: str | None = None,
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"d.ditta = ${len(params)}")
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"d.id_fornitore = ${len(params)}")
    if fatturato is not None:
        params.append(fatturato)
        filters.append(f"dr.fatturato = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = await conn.fetch(
        f"""
        SELECT
            dr.id, dr.id_ddt, dr.numero_riga,
            d.codice_ddt, d.stato AS stato_ddt, d.data_ddt,
            d.numero_ddt_fornitore,
            f.ragione_sociale AS fornitore,
            COALESCE(p.codice_prodotto, po.codice_prodotto) AS codice_prodotto,
            COALESCE(p.descrizione, po.descrizione) AS descrizione_prodotto,
            COALESCE(dr.descrizione_libera, orr.descrizione_libera) AS descrizione_libera,
            dr.quantita_consegnata, dr.unita_misura, dr.quantita_kg,
            dr.lotto, dr.numero_colata, dr.certificato_qualita,
            dr.fatturato, dr.note,
            orr.qualita_acciaio, orr.lunghezza_mm
        FROM ddt_righe dr
        JOIN ddt d ON d.id = dr.id_ddt
        JOIN fornitori f ON f.id = d.id_fornitore
        LEFT JOIN prodotti p ON p.id = dr.id_prodotto
        LEFT JOIN ordini_righe orr ON orr.id = dr.id_riga_ordine
        LEFT JOIN prodotti po ON po.id = orr.id_prodotto
        {where}
        ORDER BY d.data_ddt DESC, d.id, dr.numero_riga
        """,
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/{id}", response_model=DdtConRighe)
async def get_ddt(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        """SELECT d.*, v.ragione_sociale AS nome_vettore
           FROM ddt d
           LEFT JOIN vettori v ON v.id = d.id_vettore
           WHERE d.id = $1""",
        id,
    )
    if not row:
        raise HTTPException(404)
    righe = await conn.fetch(
        """SELECT dr.id, dr.id_ddt, dr.numero_riga, dr.id_ordine, dr.id_riga_ordine,
                  COALESCE(dr.id_prodotto, orr.id_prodotto) AS id_prodotto,
                  COALESCE(dr.descrizione_libera, orr.descrizione_libera) AS descrizione_libera,
                  dr.quantita_consegnata, dr.unita_misura, dr.quantita_kg,
                  dr.lotto, dr.numero_colata, dr.certificato_qualita, dr.note,
                  dr.fatturato, dr.created_at, dr.updated_at,
                  orr.qualita_acciaio, orr.lunghezza_mm
           FROM ddt_righe dr
           LEFT JOIN ordini_righe orr ON orr.id = dr.id_riga_ordine
           WHERE dr.id_ddt = $1 ORDER BY dr.numero_riga""",
        id,
    )
    result = dict(row)
    result["righe"] = [dict(r) for r in righe]
    return result


@router.patch("/{id}", response_model=DdtResponse)
async def update_ddt(id: int, body: DdtUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE ddt SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.CheckViolationError as e:
        raise HTTPException(422, detail=str(e))
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_ddt(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM ddt WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)


# ---------------------------------------------------------------------------
# Righe DDT
# ---------------------------------------------------------------------------

@router.get("/{id}/righe", response_model=list[DdtRigaResponse])
async def list_righe_ddt(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    ddt_row = await conn.fetchval("SELECT id FROM ddt WHERE id = $1", id)
    if not ddt_row:
        raise HTTPException(404, "DDT non trovato")
    rows = await conn.fetch(
        "SELECT * FROM ddt_righe WHERE id_ddt = $1 ORDER BY numero_riga", id
    )
    return [dict(r) for r in rows]


@router.post("/{id}/righe", response_model=DdtRigaResponse, status_code=201)
async def add_riga_ddt(id: int, body: DdtRigaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    ddt_ditta = await conn.fetchval("SELECT ditta FROM ddt WHERE id = $1", id)
    if ddt_ditta is None:
        raise HTTPException(404, "DDT non trovato")
    if body.id_ordine is not None:
        ordine_ditta = await conn.fetchval("SELECT ditta FROM ordini WHERE id = $1", body.id_ordine)
        if ordine_ditta is not None and ordine_ditta != ddt_ditta:
            raise HTTPException(422, "L'ordine collegato appartiene a un'altra ditta")
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO ddt_righe (
                id_ddt, numero_riga, id_ordine, id_riga_ordine, id_prodotto,
                descrizione_libera, quantita_consegnata, unita_misura, quantita_kg,
                lotto, numero_colata, certificato_qualita, note
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *
            """,
            id, body.numero_riga, body.id_ordine, body.id_riga_ordine, body.id_prodotto,
            body.descrizione_libera, body.quantita_consegnata, body.unita_misura, body.quantita_kg,
            body.lotto, body.numero_colata, body.certificato_qualita, body.note,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Riga {body.numero_riga} già presente su questo DDT")
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.patch("/{id}/righe/{riga_id}", response_model=DdtRigaResponse)
async def update_riga_ddt(
    id: int, riga_id: int, body: DdtRigaUpdate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "SELECT id FROM ddt_righe WHERE id = $1 AND id_ddt = $2", riga_id, id
    )
    if not row:
        raise HTTPException(404)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    updated = await conn.fetchrow(
        f"UPDATE ddt_righe SET {sets} WHERE id = $1 RETURNING *",
        riga_id, *updates.values(),
    )
    return dict(updated)


@router.delete("/{id}/righe/{riga_id}", status_code=204)
async def delete_riga_ddt(id: int, riga_id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute(
        "DELETE FROM ddt_righe WHERE id = $1 AND id_ddt = $2", riga_id, id
    )
    if result == "DELETE 0":
        raise HTTPException(404)

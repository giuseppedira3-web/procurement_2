from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from codici import genera_codice
from schemas import (
    FatturaCreate, FatturaUpdate, FatturaResponse, FatturaConRighe,
    FatturaRigaCreate, FatturaRigaUpdate, FatturaRigaResponse,
)

router = APIRouter(prefix="/fatture", tags=["Fatture"])


# ---------------------------------------------------------------------------
# Testata fattura
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[FatturaResponse])
async def list_fatture(
    id_fornitore: int | None = None,
    stato: str | None = None,
    tipo_documento_sdi: str | None = None,
    q: str | None = Query(None, description="Cerca per codice o numero fattura fornitore"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    if stato:
        params.append(stato)
        filters.append(f"stato = ${len(params)}")
    if tipo_documento_sdi:
        params.append(tipo_documento_sdi)
        filters.append(f"tipo_documento_sdi = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        filters.append(
            f"(codice_fattura ILIKE ${len(params)} OR numero_fattura_fornitore ILIKE ${len(params)})"
        )
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM fatture {where} ORDER BY data_fattura DESC LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=FatturaConRighe, status_code=201)
async def create_fattura(body: FatturaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        try:
            codice, _, _ = await genera_codice(conn, "fattura", body.id_fornitore)
        except ValueError as e:
            raise HTTPException(422, detail=str(e))
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO fatture (
                    codice_fattura, id_fornitore, numero_fattura_fornitore,
                    data_fattura, data_ricezione, data_scadenza,
                    imponibile, aliquota_iva, importo_iva, totale, valuta,
                    stato, modalita_pagamento, riferimento_riba,
                    numero_sdi, xml_sdi_path, codice_destinatario,
                    tipo_documento_sdi, data_ricezione_sdi, note
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                RETURNING *
                """,
                codice, body.id_fornitore, body.numero_fattura_fornitore,
                body.data_fattura, body.data_ricezione, body.data_scadenza,
                body.imponibile, body.aliquota_iva, body.importo_iva, body.totale, body.valuta,
                body.stato, body.modalita_pagamento, body.riferimento_riba,
                body.numero_sdi, body.xml_sdi_path, body.codice_destinatario,
                body.tipo_documento_sdi, body.data_ricezione_sdi, body.note,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, "Fattura già presente per questo fornitore con questo numero")
        except asyncpg.ForeignKeyViolationError as e:
            raise HTTPException(422, detail=str(e))
    result = dict(row)
    result["righe"] = []
    return result


@router.get("/{id}", response_model=FatturaConRighe)
async def get_fattura(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM fatture WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    righe = await conn.fetch(
        "SELECT * FROM fatture_righe WHERE id_fattura = $1 ORDER BY numero_riga", id
    )
    result = dict(row)
    result["righe"] = [dict(r) for r in righe]
    return result


@router.patch("/{id}", response_model=FatturaResponse)
async def update_fattura(id: int, body: FatturaUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE fatture SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.CheckViolationError as e:
        raise HTTPException(422, detail=str(e))
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_fattura(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM fatture WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)


# ---------------------------------------------------------------------------
# Righe fattura
# ---------------------------------------------------------------------------

@router.get("/{id}/righe", response_model=list[FatturaRigaResponse])
async def list_righe_fattura(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    ft = await conn.fetchval("SELECT id FROM fatture WHERE id = $1", id)
    if not ft:
        raise HTTPException(404, "Fattura non trovata")
    rows = await conn.fetch(
        "SELECT * FROM fatture_righe WHERE id_fattura = $1 ORDER BY numero_riga", id
    )
    return [dict(r) for r in rows]


@router.post("/{id}/righe", response_model=FatturaRigaResponse, status_code=201)
async def add_riga_fattura(id: int, body: FatturaRigaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    ft = await conn.fetchval("SELECT id FROM fatture WHERE id = $1", id)
    if not ft:
        raise HTTPException(404, "Fattura non trovata")
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO fatture_righe (
                id_fattura, numero_riga,
                id_ddt, id_riga_ddt, id_ordine, id_riga_ordine, id_prodotto,
                descrizione_fattura, quantita, unita_misura,
                prezzo_unitario, sconto_percentuale, importo_riga, aliquota_iva, note
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING *
            """,
            id, body.numero_riga,
            body.id_ddt, body.id_riga_ddt, body.id_ordine, body.id_riga_ordine, body.id_prodotto,
            body.descrizione_fattura, body.quantita, body.unita_misura,
            body.prezzo_unitario, body.sconto_percentuale, body.importo_riga, body.aliquota_iva, body.note,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Riga {body.numero_riga} già presente su questa fattura")
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.patch("/{id}/righe/{riga_id}", response_model=FatturaRigaResponse)
async def update_riga_fattura(
    id: int, riga_id: int, body: FatturaRigaUpdate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "SELECT id FROM fatture_righe WHERE id = $1 AND id_fattura = $2", riga_id, id
    )
    if not row:
        raise HTTPException(404)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    updated = await conn.fetchrow(
        f"UPDATE fatture_righe SET {sets} WHERE id = $1 RETURNING *",
        riga_id, *updates.values(),
    )
    return dict(updated)


@router.delete("/{id}/righe/{riga_id}", status_code=204)
async def delete_riga_fattura(id: int, riga_id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute(
        "DELETE FROM fatture_righe WHERE id = $1 AND id_fattura = $2", riga_id, id
    )
    if result == "DELETE 0":
        raise HTTPException(404)

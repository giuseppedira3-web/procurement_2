from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from database import get_conn
from codici import genera_codice
from schemas import (
    OrdineCreate, OrdineUpdate, OrdineResponse, OrdineConRighe,
    OrdineRigaCreate, OrdineRigaUpdate, OrdineRigaResponse,
)

router = APIRouter(prefix="/ordini", tags=["Ordini di Acquisto"])


# ---------------------------------------------------------------------------
# Testata ordine
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[OrdineResponse])
async def list_ordini(
    id_fornitore: int | None = None,
    id_zincheria: int | None = None,
    stato: str | None = None,
    anno: int | None = None,
    q: str | None = Query(None, description="Cerca per codice o riferimento fornitore"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"o.id_fornitore = ${len(params)}")
    if id_zincheria is not None:
        params.append(id_zincheria)
        filters.append(f"o.id_zincheria = ${len(params)} AND o.zincatura = true")
    if stato:
        params.append(stato)
        filters.append(f"o.stato = ${len(params)}")
    if anno:
        params.append(anno)
        filters.append(f"o.anno = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        filters.append(f"(o.codice_ordine ILIKE ${len(params)} OR o.riferimento_fornitore ILIKE ${len(params)})")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"""SELECT o.*,
                mf.comune AS comune_origine,
                v.ragione_sociale AS nome_vettore,
                z.ragione_sociale AS nome_zincheria
            FROM ordini o
            LEFT JOIN magazzini_fornitore mf ON mf.id = o.id_magazzino_origine
            LEFT JOIN vettori v ON v.id = o.id_vettore
            LEFT JOIN fornitori z ON z.id = o.id_zincheria
            {where} ORDER BY o.anno DESC, o.numero_progressivo DESC LIMIT ${n-1} OFFSET ${n}""",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=OrdineConRighe, status_code=201)
async def create_ordine(body: OrdineCreate, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        try:
            codice, numero, anno = await genera_codice(conn, "ordine", body.id_fornitore)
        except ValueError as e:
            raise HTTPException(422, detail=str(e))
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO ordini (
                    codice_ordine, id_fornitore, numero_progressivo, anno,
                    riferimento_fornitore, data_ordine, data_consegna_prevista,
                    luogo_consegna, incoterm, valuta, stato,
                    id_magazzino_origine, comune_destinazione, id_vettore,
                    zincatura, id_zincheria, note
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                RETURNING *
                """,
                codice, body.id_fornitore, numero, anno,
                body.riferimento_fornitore, body.data_ordine, body.data_consegna_prevista,
                body.luogo_consegna, body.incoterm, body.valuta, body.stato,
                body.id_magazzino_origine, body.comune_destinazione, body.id_vettore,
                body.zincatura, body.id_zincheria, body.note,
            )
        except asyncpg.ForeignKeyViolationError as e:
            raise HTTPException(422, detail=str(e))
    result = dict(row)
    result["righe"] = []
    return result


@router.get("/all-righe")
async def list_all_righe(
    id_fornitore: int | None = None,
    stato_riga: str | None = None,
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"o.id_fornitore = ${len(params)}")
    if stato_riga:
        params.append(stato_riga)
        filters.append(f"r.stato_riga = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = await conn.fetch(f"""
        SELECT
            r.id, r.id_ordine, r.numero_riga,
            r.id_prodotto, r.descrizione_libera,
            r.quantita_ordinata, r.unita_misura, r.quantita_kg,
            r.prezzo_unitario, r.importo_riga,
            r.quantita_consegnata, r.quantita_fatturata, r.stato_riga,
            r.qualita_acciaio, r.lunghezza_mm,
            r.data_consegna_prevista,
            o.codice_ordine, o.riferimento_fornitore, o.data_ordine, o.stato AS stato_ordine,
            o.id_fornitore,
            p.codice_prodotto,
            p.descrizione AS descrizione_prodotto
        FROM ordini_righe r
        JOIN ordini o ON o.id = r.id_ordine
        LEFT JOIN prodotti p ON p.id = r.id_prodotto
        {where}
        ORDER BY o.anno DESC, o.numero_progressivo, r.numero_riga
    """, *params)
    return [dict(r) for r in rows]


@router.get("/{id}", response_model=OrdineConRighe)
async def get_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        """SELECT o.*,
               mf.comune AS comune_origine,
               v.ragione_sociale AS nome_vettore,
               z.ragione_sociale AS nome_zincheria
           FROM ordini o
           LEFT JOIN magazzini_fornitore mf ON mf.id = o.id_magazzino_origine
           LEFT JOIN vettori v ON v.id = o.id_vettore
           LEFT JOIN fornitori z ON z.id = o.id_zincheria
           WHERE o.id = $1""",
        id,
    )
    if not row:
        raise HTTPException(404)
    righe = await conn.fetch(
        "SELECT * FROM ordini_righe WHERE id_ordine = $1 ORDER BY numero_riga", id
    )
    result = dict(row)
    result["righe"] = [dict(r) for r in righe]
    return result


@router.patch("/{id}", response_model=OrdineResponse)
async def update_ordine(id: int, body: OrdineUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE ordini SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.CheckViolationError as e:
        raise HTTPException(422, detail=str(e))
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM ordini WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)


# ---------------------------------------------------------------------------
# Righe ordine
# ---------------------------------------------------------------------------

def _calcola_importo(qta: Decimal, prezzo: Decimal, *sconti: Decimal,
                     prezzo_zincatura: Decimal | None = None) -> Decimal:
    result = qta * prezzo
    for s in sconti:
        result *= (1 + s / 100)
    if prezzo_zincatura:
        result += qta * prezzo_zincatura
    return result.quantize(Decimal("0.01"))


@router.get("/{id}/righe", response_model=list[OrdineRigaResponse])
async def list_righe_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    ordine = await conn.fetchval("SELECT id FROM ordini WHERE id = $1", id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")
    rows = await conn.fetch(
        "SELECT * FROM ordini_righe WHERE id_ordine = $1 ORDER BY numero_riga", id
    )
    return [dict(r) for r in rows]


@router.post("/{id}/righe", response_model=OrdineRigaResponse, status_code=201)
async def add_riga_ordine(id: int, body: OrdineRigaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    ordine = await conn.fetchval("SELECT id FROM ordini WHERE id = $1", id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")
    importo = _calcola_importo(
        body.quantita_ordinata, body.prezzo_unitario,
        body.sconto_percentuale, body.sconto_2_percentuale,
        body.sconto_3_percentuale, body.sconto_4_percentuale,
        prezzo_zincatura=body.prezzo_zincatura,
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO ordini_righe (
                id_ordine, numero_riga, id_prodotto, descrizione_libera,
                quantita_ordinata, unita_misura, quantita_kg,
                prezzo_unitario, valuta,
                sconto_percentuale, sconto_2_percentuale, sconto_3_percentuale, sconto_4_percentuale,
                importo_riga, tolleranza_chiusura_kg,
                qualita_acciaio, lunghezza_mm,
                id_listino_zincatura, prezzo_zincatura,
                data_consegna_prevista, note
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
            RETURNING *
            """,
            id, body.numero_riga, body.id_prodotto, body.descrizione_libera,
            body.quantita_ordinata, body.unita_misura, body.quantita_kg,
            body.prezzo_unitario, body.valuta,
            body.sconto_percentuale, body.sconto_2_percentuale,
            body.sconto_3_percentuale, body.sconto_4_percentuale,
            importo, body.tolleranza_chiusura_kg,
            body.qualita_acciaio, body.lunghezza_mm,
            body.id_listino_zincatura, body.prezzo_zincatura,
            body.data_consegna_prevista, body.note,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Riga {body.numero_riga} già presente su questo ordine")
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.patch("/{id}/righe/{riga_id}", response_model=OrdineRigaResponse)
async def update_riga_ordine(
    id: int, riga_id: int, body: OrdineRigaUpdate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "SELECT * FROM ordini_righe WHERE id = $1 AND id_ordine = $2", riga_id, id
    )
    if not row:
        raise HTTPException(404)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    # Ricalcola importo se cambiano quantità, prezzo o uno degli sconti
    qta    = Decimal(str(updates.get("quantita_ordinata",   row["quantita_ordinata"])))
    prezzo = Decimal(str(updates.get("prezzo_unitario",     row["prezzo_unitario"])))
    s1     = Decimal(str(updates.get("sconto_percentuale",   row["sconto_percentuale"])))
    s2     = Decimal(str(updates.get("sconto_2_percentuale", row["sconto_2_percentuale"])))
    s3     = Decimal(str(updates.get("sconto_3_percentuale", row["sconto_3_percentuale"])))
    s4     = Decimal(str(updates.get("sconto_4_percentuale", row["sconto_4_percentuale"])))
    pz_raw = updates.get("prezzo_zincatura", row["prezzo_zincatura"])
    pz     = Decimal(str(pz_raw)) if pz_raw is not None else None
    updates["importo_riga"] = _calcola_importo(qta, prezzo, s1, s2, s3, s4, prezzo_zincatura=pz)
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    updated = await conn.fetchrow(
        f"UPDATE ordini_righe SET {sets} WHERE id = $1 RETURNING *",
        riga_id, *updates.values(),
    )
    return dict(updated)


@router.delete("/{id}/righe/{riga_id}", status_code=204)
async def delete_riga_ordine(id: int, riga_id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute(
        "DELETE FROM ordini_righe WHERE id = $1 AND id_ordine = $2", riga_id, id
    )
    if result == "DELETE 0":
        raise HTTPException(404)

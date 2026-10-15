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

FATTURA_ACC_FIELDS = (
    "fattura_accompagnatoria", "numero_fattura_accompagnatoria", "data_fattura_accompagnatoria",
)

# Colonne della fattura accompagnatoria lette dal DDT collegato (alias fa).
FATTURA_ACC_SELECT = """
    fa.id IS NOT NULL AS fattura_accompagnatoria,
    fa.numero_ddt_fornitore AS numero_fattura_accompagnatoria,
    fa.data_ddt AS data_fattura_accompagnatoria,
    fa.codice_ddt AS codice_ddt_accompagnatoria"""


# ---------------------------------------------------------------------------
# Fattura accompagnatoria: DDT generato e tenuto allineato all'ordine
# ---------------------------------------------------------------------------

async def _crea_ddt_accompagnatoria(conn: asyncpg.Connection, ordine, numero: str, data) -> int:
    """Crea il DDT della fattura accompagnatoria, lo collega all'ordine e
    genera le righe DDT per le righe ordine già presenti."""
    try:
        codice, _, _ = await genera_codice(conn, "ddt", ordine["id_fornitore"])
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    try:
        id_ddt = await conn.fetchval(
            """
            INSERT INTO ddt (
                codice_ddt, id_fornitore, numero_ddt_fornitore, data_ddt, data_ricezione,
                id_vettore, stato, ditta, note
            ) VALUES ($1,$2,$3,$4,$4,$5,'ricevuto',$6,$7)
            RETURNING id
            """,
            codice, ordine["id_fornitore"], numero.strip(), data,
            ordine["id_vettore"], ordine["ditta"],
            f"Fattura accompagnatoria — ordine {ordine['codice_ordine']}",
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Esiste già un DDT n° {numero.strip()} per questo fornitore")
    await conn.execute(
        "UPDATE ordini SET id_ddt_accompagnatoria = $1 WHERE id = $2", id_ddt, ordine["id"],
    )
    righe = await conn.fetch("SELECT * FROM ordini_righe WHERE id_ordine = $1 ORDER BY numero_riga", ordine["id"])
    for riga in righe:
        await _sync_riga_ddt_accompagnatoria(conn, id_ddt, riga)
    return id_ddt


async def _sync_riga_ddt_accompagnatoria(conn: asyncpg.Connection, id_ddt: int, riga) -> None:
    """Crea o aggiorna la riga del DDT accompagnatoria con la stessa quantità
    della riga ordine: il trigger su ddt_righe chiude la riga ordine."""
    updated = await conn.execute(
        """
        UPDATE ddt_righe SET
            id_prodotto = $3, descrizione_libera = $4,
            quantita_consegnata = $5, unita_misura = $6, quantita_kg = $7
        WHERE id_ddt = $1 AND id_riga_ordine = $2
        """,
        id_ddt, riga["id"], riga["id_prodotto"], riga["descrizione_libera"],
        riga["quantita_ordinata"], riga["unita_misura"], riga["quantita_kg"],
    )
    if updated != "UPDATE 0":
        return
    await conn.execute(
        """
        INSERT INTO ddt_righe (
            id_ddt, numero_riga, id_ordine, id_riga_ordine, id_prodotto,
            descrizione_libera, quantita_consegnata, unita_misura, quantita_kg
        ) VALUES (
            $1, (SELECT COALESCE(MAX(numero_riga), 0) + 1 FROM ddt_righe WHERE id_ddt = $1),
            $2, $3, $4, $5, $6, $7, $8
        )
        """,
        id_ddt, riga["id_ordine"], riga["id"], riga["id_prodotto"], riga["descrizione_libera"],
        riga["quantita_ordinata"], riga["unita_misura"], riga["quantita_kg"],
    )


async def _elimina_ddt_accompagnatoria(conn: asyncpg.Connection, id_ddt: int) -> None:
    fatturato = await conn.fetchval(
        """SELECT d.stato = 'fatturato' OR EXISTS (
               SELECT 1 FROM ddt_righe dr WHERE dr.id_ddt = d.id AND dr.fatturato)
           FROM ddt d WHERE d.id = $1""",
        id_ddt,
    )
    if fatturato:
        raise HTTPException(422, "Il DDT della fattura accompagnatoria risulta già fatturato")
    await conn.execute("DELETE FROM ddt WHERE id = $1", id_ddt)


async def _aggiorna_fattura_accompagnatoria(conn: asyncpg.Connection, ordine, fattura: dict) -> None:
    """Applica il flag dalla modifica testata: attivato → crea il DDT,
    disattivato → lo elimina, altrimenti aggiorna numero/data sul DDT."""
    flag = fattura.get("fattura_accompagnatoria")
    numero = (fattura.get("numero_fattura_accompagnatoria") or "").strip()
    data = fattura.get("data_fattura_accompagnatoria")
    id_ddt = ordine["id_ddt_accompagnatoria"]
    if flag is False:
        if id_ddt:
            await _elimina_ddt_accompagnatoria(conn, id_ddt)
        return
    if flag and (not numero or data is None):
        raise HTTPException(422, "Numero e data della fattura accompagnatoria obbligatori")
    if id_ddt is None:
        if flag:
            await _crea_ddt_accompagnatoria(conn, ordine, numero, data)
        return
    try:
        await conn.execute(
            """UPDATE ddt SET
                   numero_ddt_fornitore = COALESCE($2, numero_ddt_fornitore),
                   data_ddt = COALESCE($3, data_ddt),
                   data_ricezione = COALESCE($3, data_ricezione)
               WHERE id = $1""",
            id_ddt, numero or None, data,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Esiste già un DDT n° {numero} per questo fornitore")


async def _get_riga(conn: asyncpg.Connection, riga_id: int) -> dict:
    # Riletta dopo la sincronizzazione col DDT: il trigger ha aggiornato
    # quantita_consegnata e stato_riga.
    return dict(await conn.fetchrow("SELECT * FROM ordini_righe WHERE id = $1", riga_id))


# ---------------------------------------------------------------------------
# Testata ordine
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[OrdineResponse])
async def list_ordini(
    id_fornitore: int | None = None,
    id_zincheria: int | None = None,
    stato: str | None = None,
    anno: int | None = None,
    ditta: str | None = None,
    q: str | None = Query(None, description="Cerca per codice o riferimento fornitore"),
    limit: int = Query(50, le=1000),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
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
                z.ragione_sociale AS nome_zincheria,
                {FATTURA_ACC_SELECT},
                (SELECT ROUND(100.0 * SUM(r.quantita_consegnata)
                             / NULLIF(SUM(r.quantita_ordinata), 0), 1)
                   FROM ordini_righe r WHERE r.id_ordine = o.id) AS perc_consegnato
            FROM ordini o
            LEFT JOIN magazzini_fornitore mf ON mf.id = o.id_magazzino_origine
            LEFT JOIN vettori v ON v.id = o.id_vettore
            LEFT JOIN fornitori z ON z.id = o.id_zincheria
            LEFT JOIN ddt fa ON fa.id = o.id_ddt_accompagnatoria
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
                    zincatura, id_zincheria, cbam, prezzo_cbam_kg,
                    coperto, sconto_coperto_kg, ditta, note
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                RETURNING *
                """,
                codice, body.id_fornitore, numero, anno,
                body.riferimento_fornitore, body.data_ordine, body.data_consegna_prevista,
                body.luogo_consegna, body.incoterm, body.valuta, body.stato,
                body.id_magazzino_origine, body.comune_destinazione, body.id_vettore,
                body.zincatura, body.id_zincheria, body.cbam, body.prezzo_cbam_kg,
                body.coperto, body.sconto_coperto_kg, body.ditta, body.note,
            )
        except asyncpg.ForeignKeyViolationError as e:
            raise HTTPException(422, detail=str(e))
        result = dict(row)
        if body.fattura_accompagnatoria:
            result["id_ddt_accompagnatoria"] = await _crea_ddt_accompagnatoria(
                conn, row, body.numero_fattura_accompagnatoria, body.data_fattura_accompagnatoria,
            )
            result.update(
                fattura_accompagnatoria=True,
                numero_fattura_accompagnatoria=body.numero_fattura_accompagnatoria.strip(),
                data_fattura_accompagnatoria=body.data_fattura_accompagnatoria,
            )
    result["righe"] = []
    return result


@router.get("/all-righe")
async def list_all_righe(
    id_fornitore: int | None = None,
    stato_riga: str | None = None,
    ditta: str | None = None,
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
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
            r.sconto_percentuale, r.sconto_2_percentuale, r.sconto_3_percentuale, r.sconto_4_percentuale,
            r.prezzo_zincatura, r.prezzo_cbam_kg, r.sconto_coperto_kg, r.prezzo_extra,
            t.prezzo_trasporto_kg,
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
        LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
        {where}
        ORDER BY o.anno DESC, o.numero_progressivo, r.numero_riga
    """, *params)
    return [dict(r) for r in rows]


@router.get("/{id}", response_model=OrdineConRighe)
async def get_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        f"""SELECT o.*,
               mf.comune AS comune_origine,
               v.ragione_sociale AS nome_vettore,
               z.ragione_sociale AS nome_zincheria,
               {FATTURA_ACC_SELECT}
           FROM ordini o
           LEFT JOIN magazzini_fornitore mf ON mf.id = o.id_magazzino_origine
           LEFT JOIN vettori v ON v.id = o.id_vettore
           LEFT JOIN fornitori z ON z.id = o.id_zincheria
           LEFT JOIN ddt fa ON fa.id = o.id_ddt_accompagnatoria
           WHERE o.id = $1""",
        id,
    )
    if not row:
        raise HTTPException(404)
    righe = await conn.fetch(
        """SELECT r.*, t.costo_trasporto_tot, t.prezzo_trasporto_kg
           FROM ordini_righe r
           LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
           WHERE r.id_ordine = $1 ORDER BY r.numero_riga""",
        id,
    )
    # DDT con almeno una riga su questo ordine (collegata alla testata o a
    # una sua riga), con i kg consegnati per questo ordine.
    ddt_collegati = await conn.fetch(
        """SELECT d.id, d.codice_ddt, d.numero_ddt_fornitore, d.data_ddt, d.stato,
                  SUM(COALESCE(dr.quantita_kg,
                      CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END)) AS kg_consegnati
           FROM ddt_righe dr
           JOIN ddt d ON d.id = dr.id_ddt
           LEFT JOIN ordini_righe r ON r.id = dr.id_riga_ordine
           WHERE dr.id_ordine = $1 OR r.id_ordine = $1
           GROUP BY d.id
           ORDER BY d.data_ddt, d.id""",
        id,
    )
    result = dict(row)
    result["righe"] = [dict(r) for r in righe]
    result["ddt_collegati"] = [dict(d) for d in ddt_collegati]
    return result


@router.patch("/{id}", response_model=OrdineResponse)
async def update_ordine(id: int, body: OrdineUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = body.model_dump(exclude_unset=True)
    # I campi fattura accompagnatoria vivono sul DDT collegato, non su ordini.
    fattura = {k: updates.pop(k) for k in FATTURA_ACC_FIELDS if k in updates}
    if not updates and not fattura:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    async with conn.transaction():
        try:
            if updates:
                row = await conn.fetchrow(
                    f"UPDATE ordini SET {sets} WHERE id = $1 RETURNING *",
                    id, *updates.values(),
                )
            else:
                row = await conn.fetchrow("SELECT * FROM ordini WHERE id = $1", id)
        except asyncpg.CheckViolationError as e:
            raise HTTPException(422, detail=str(e))
        if not row:
            raise HTTPException(404)
        if fattura:
            await _aggiorna_fattura_accompagnatoria(conn, row, fattura)
        if "ditta" in updates and row["id_ddt_accompagnatoria"]:
            await conn.execute(
                "UPDATE ddt SET ditta = $1 WHERE id = $2", row["ditta"], row["id_ddt_accompagnatoria"],
            )
        # CBAM/Coperto: la tariffa è impostata una volta in testata (spesso
        # una stima iniziale) e finché non si tocca la riga resta agganciata
        # al valore di testata — se qui cambia tariffa/sconto o flag,
        # ripropaga a tutte le righe e ricalcola l'importo, invece di
        # lasciarle congelate al vecchio snapshot.
        if any(k in updates for k in ("prezzo_cbam_kg", "cbam", "sconto_coperto_kg", "coperto")):
            if "prezzo_cbam_kg" in updates or "cbam" in updates:
                nuovo_cbam = row["prezzo_cbam_kg"] if row["cbam"] else None
                await conn.execute(
                    "UPDATE ordini_righe SET prezzo_cbam_kg = $1 WHERE id_ordine = $2",
                    nuovo_cbam, id,
                )
            if "sconto_coperto_kg" in updates or "coperto" in updates:
                nuovo_coperto = row["sconto_coperto_kg"] if row["coperto"] else None
                await conn.execute(
                    "UPDATE ordini_righe SET sconto_coperto_kg = $1 WHERE id_ordine = $2",
                    nuovo_coperto, id,
                )
            await conn.execute(
                """
                UPDATE ordini_righe SET importo_riga = ROUND(
                    quantita_ordinata * prezzo_unitario
                      * (1 + COALESCE(sconto_percentuale,0)/100)
                      * (1 + COALESCE(sconto_2_percentuale,0)/100)
                      * (1 + COALESCE(sconto_3_percentuale,0)/100)
                      * (1 + COALESCE(sconto_4_percentuale,0)/100)
                    + quantita_ordinata * COALESCE(prezzo_zincatura,0)
                    + quantita_ordinata * COALESCE(prezzo_cbam_kg,0)
                    + quantita_ordinata * COALESCE(sconto_coperto_kg,0)
                    + quantita_ordinata * COALESCE(prezzo_extra,0)
                , 2)
                WHERE id_ordine = $1
                """,
                id,
            )
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        # Il DDT della fattura accompagnatoria esiste solo per l'ordine: va via
        # con lui (e le sue righe, che altrimenti bloccherebbero la delete).
        id_ddt = await conn.fetchval("SELECT id_ddt_accompagnatoria FROM ordini WHERE id = $1", id)
        if id_ddt:
            await _elimina_ddt_accompagnatoria(conn, id_ddt)
        result = await conn.execute("DELETE FROM ordini WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)


# ---------------------------------------------------------------------------
# Righe ordine
# ---------------------------------------------------------------------------

def _calcola_importo(qta: Decimal, prezzo: Decimal, *sconti: Decimal,
                     prezzo_zincatura: Decimal | None = None,
                     prezzo_cbam_kg: Decimal | None = None,
                     sconto_coperto_kg: Decimal | None = None,
                     prezzo_extra: Decimal | None = None) -> Decimal:
    result = qta * prezzo
    for s in sconti:
        result *= (1 + s / 100)
    # Extra listino TUBOLARE: sommato dopo gli sconti, non scontato
    if prezzo_extra:
        result += qta * prezzo_extra
    if prezzo_zincatura:
        result += qta * prezzo_zincatura
    if prezzo_cbam_kg:
        result += qta * prezzo_cbam_kg
    if sconto_coperto_kg:
        result += qta * sconto_coperto_kg
    return result.quantize(Decimal("0.01"))


@router.get("/{id}/righe", response_model=list[OrdineRigaResponse])
async def list_righe_ordine(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    ordine = await conn.fetchval("SELECT id FROM ordini WHERE id = $1", id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")
    rows = await conn.fetch(
        """SELECT r.*, t.costo_trasporto_tot, t.prezzo_trasporto_kg
           FROM ordini_righe r
           LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
           WHERE r.id_ordine = $1 ORDER BY r.numero_riga""",
        id,
    )
    return [dict(r) for r in rows]


@router.post("/{id}/righe", response_model=OrdineRigaResponse, status_code=201)
async def add_riga_ordine(id: int, body: OrdineRigaCreate, conn: asyncpg.Connection = Depends(get_conn)):
    ordine = await conn.fetchrow("SELECT id, id_ddt_accompagnatoria FROM ordini WHERE id = $1", id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")
    if body.id_prodotto is not None:
        cat_codice = await conn.fetchval(
            "SELECT cp.codice FROM prodotti p JOIN categorie_prodotto cp ON cp.id = p.id_categoria WHERE p.id = $1",
            body.id_prodotto,
        )
        if cat_codice == "TUBOLARE" and "sconto_percentuale" not in body.model_fields_set:
            raise HTTPException(422, "Sc.1% obbligatorio per i prodotti TUBOLARE")
        if cat_codice == "TUBOLARE" and body.prezzo_extra is None:
            raise HTTPException(422, "Extra obbligatorio per i prodotti TUBOLARE")
    importo = _calcola_importo(
        body.quantita_ordinata, body.prezzo_unitario,
        body.sconto_percentuale, body.sconto_2_percentuale,
        body.sconto_3_percentuale, body.sconto_4_percentuale,
        prezzo_zincatura=body.prezzo_zincatura,
        prezzo_cbam_kg=body.prezzo_cbam_kg,
        sconto_coperto_kg=body.sconto_coperto_kg,
        prezzo_extra=body.prezzo_extra,
    )
    async with conn.transaction():
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
                    id_listino_zincatura, prezzo_zincatura, prezzo_cbam_kg, sconto_coperto_kg, prezzo_extra,
                    data_consegna_prevista, note
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
                RETURNING *
                """,
                id, body.numero_riga, body.id_prodotto, body.descrizione_libera,
                body.quantita_ordinata, body.unita_misura, body.quantita_kg,
                body.prezzo_unitario, body.valuta,
                body.sconto_percentuale, body.sconto_2_percentuale,
                body.sconto_3_percentuale, body.sconto_4_percentuale,
                importo, body.tolleranza_chiusura_kg,
                body.qualita_acciaio, body.lunghezza_mm,
                body.id_listino_zincatura, body.prezzo_zincatura, body.prezzo_cbam_kg, body.sconto_coperto_kg, body.prezzo_extra,
                body.data_consegna_prevista, body.note,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, f"Riga {body.numero_riga} già presente su questo ordine")
        except asyncpg.ForeignKeyViolationError as e:
            raise HTTPException(422, detail=str(e))
        if ordine["id_ddt_accompagnatoria"]:
            await _sync_riga_ddt_accompagnatoria(conn, ordine["id_ddt_accompagnatoria"], row)
            return await _get_riga(conn, row["id"])
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
    cbam_raw = updates.get("prezzo_cbam_kg", row["prezzo_cbam_kg"])
    cbam_kg  = Decimal(str(cbam_raw)) if cbam_raw is not None else None
    coperto_raw = updates.get("sconto_coperto_kg", row["sconto_coperto_kg"])
    coperto_kg  = Decimal(str(coperto_raw)) if coperto_raw is not None else None
    extra_raw   = updates.get("prezzo_extra", row["prezzo_extra"])
    extra       = Decimal(str(extra_raw)) if extra_raw is not None else None
    id_prodotto = updates.get("id_prodotto", row["id_prodotto"])
    if id_prodotto is not None and extra is None:
        cat_codice = await conn.fetchval(
            "SELECT cp.codice FROM prodotti p JOIN categorie_prodotto cp ON cp.id = p.id_categoria WHERE p.id = $1",
            id_prodotto,
        )
        if cat_codice == "TUBOLARE":
            raise HTTPException(422, "Extra obbligatorio per i prodotti TUBOLARE")
    updates["importo_riga"] = _calcola_importo(
        qta, prezzo, s1, s2, s3, s4,
        prezzo_zincatura=pz, prezzo_cbam_kg=cbam_kg, sconto_coperto_kg=coperto_kg,
        prezzo_extra=extra,
    )
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    async with conn.transaction():
        updated = await conn.fetchrow(
            f"UPDATE ordini_righe SET {sets} WHERE id = $1 RETURNING *",
            riga_id, *updates.values(),
        )
        # Solo se cambia ciò che finisce sul DDT: un cambio stato manuale non
        # deve essere ricalcolato dal trigger.
        id_ddt = await conn.fetchval("SELECT id_ddt_accompagnatoria FROM ordini WHERE id = $1", id)
        if id_ddt and updates.keys() & {
            "id_prodotto", "descrizione_libera", "quantita_ordinata", "unita_misura",
            "quantita_kg", "tolleranza_chiusura_kg",
        }:
            await _sync_riga_ddt_accompagnatoria(conn, id_ddt, updated)
            return await _get_riga(conn, riga_id)
    return dict(updated)


@router.delete("/{id}/righe/{riga_id}", status_code=204)
async def delete_riga_ordine(id: int, riga_id: int, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        await conn.execute(
            """DELETE FROM ddt_righe dr USING ordini o
               WHERE o.id = $2 AND dr.id_ddt = o.id_ddt_accompagnatoria AND dr.id_riga_ordine = $1""",
            riga_id, id,
        )
        result = await conn.execute(
            "DELETE FROM ordini_righe WHERE id = $1 AND id_ordine = $2", riga_id, id
        )
    if result == "DELETE 0":
        raise HTTPException(404)

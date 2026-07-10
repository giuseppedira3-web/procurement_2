from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
import asyncpg
from pydantic import ValidationError
from database import get_conn
from schemas import FornitoreCreate, FornitoreUpdate, FornitoreResponse, BulkImportError, BulkImportResult
from bulk import bool_or_none, make_csv_export, make_csv_template, read_rows, str_or_none

router = APIRouter(prefix="/fornitori", tags=["Fornitori"])

IMPORT_FIELDS = [
    "codice_fornitore", "ragione_sociale", "partita_iva", "codice_fiscale",
    "indirizzo", "cap", "citta", "provincia", "paese",
    "telefono", "email", "pec", "iban",
    "condizioni_pagamento", "valuta", "attivo", "note",
]

# 1:1 con i campi della tabella fornitori
IMPORT_TEMPLATE_HEADERS = IMPORT_FIELDS


async def _insert_fornitore(conn: asyncpg.Connection, body: FornitoreCreate):
    return await conn.fetchrow(
        """
        INSERT INTO fornitori (
            codice_fornitore, ragione_sociale, tipo, partita_iva, codice_fiscale,
            indirizzo, cap, citta, provincia, paese,
            telefono, email, pec, iban,
            condizioni_pagamento, valuta, attivo, note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING *
        """,
        body.codice_fornitore, body.ragione_sociale, body.tipo, body.partita_iva,
        body.codice_fiscale, body.indirizzo, body.cap, body.citta,
        body.provincia, body.paese, body.telefono, body.email, body.pec,
        body.iban, body.condizioni_pagamento, body.valuta, body.attivo, body.note,
    )


@router.get("/", response_model=list[FornitoreResponse])
async def list_fornitori(
    attivo: bool | None = None,
    tipo: str | None = None,
    citta: str | None = None,
    q: str | None = Query(None, description="Ricerca su ragione sociale o codice"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []

    if attivo is not None:
        params.append(attivo)
        filters.append(f"attivo = ${len(params)}")
    if tipo:
        params.append(tipo)
        filters.append(f"tipo = ${len(params)}")
    if citta:
        params.append(citta)
        filters.append(f"citta ILIKE ${len(params)}")
    if q:
        params.append(f"%{q}%")
        filters.append(f"(ragione_sociale ILIKE ${len(params)} OR codice_fornitore ILIKE ${len(params)})")

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM fornitori {where} ORDER BY ragione_sociale LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=FornitoreResponse, status_code=201)
async def create_fornitore(body: FornitoreCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await _insert_fornitore(conn, body)
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    return dict(row)


@router.get("/import/template", include_in_schema=False)
async def fornitori_import_template():
    return make_csv_template("template_fornitori.csv", IMPORT_TEMPLATE_HEADERS)


@router.get("/export", include_in_schema=False)
async def export_fornitori(conn: asyncpg.Connection = Depends(get_conn)):
    cols = ", ".join(IMPORT_FIELDS)
    rows = await conn.fetch(f"SELECT {cols} FROM fornitori ORDER BY ragione_sociale")
    return make_csv_export("export_fornitori.csv", IMPORT_TEMPLATE_HEADERS, [dict(r) for r in rows])


@router.post("/import", response_model=BulkImportResult)
async def import_fornitori(file: UploadFile = File(...), conn: asyncpg.Connection = Depends(get_conn)):
    rows = await read_rows(file)
    inseriti = 0
    errori: list[BulkImportError] = []

    for i, row in enumerate(rows, start=2):
        try:
            data = {}
            for f in IMPORT_FIELDS:
                if f not in row:
                    continue
                data[f] = bool_or_none(row[f]) if f == "attivo" else str_or_none(row[f])
            data = {k: v for k, v in data.items() if v is not None}
            body = FornitoreCreate(**data)
        except ValidationError as e:
            errori.append(BulkImportError(riga=i, errore="; ".join(f"{err['loc'][-1]}: {err['msg']}" for err in e.errors())))
            continue

        try:
            await _insert_fornitore(conn, body)
            inseriti += 1
        except asyncpg.UniqueViolationError:
            errori.append(BulkImportError(riga=i, errore=f"codice_fornitore '{body.codice_fornitore}' già esistente"))
        except asyncpg.PostgresError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))

    return BulkImportResult(totale_righe=len(rows), inseriti=inseriti, errori=errori)


@router.get("/{id}", response_model=FornitoreResponse)
async def get_fornitore(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM fornitori WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=FornitoreResponse)
async def update_fornitore(id: int, body: FornitoreUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE fornitori SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_fornitore(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT ragione_sociale FROM fornitori WHERE id = $1", id)
    if not row:
        raise HTTPException(404)

    # Check for business records that block deletion
    counts = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM ordini   WHERE id_fornitore = $1) AS n_ordini,
            (SELECT COUNT(*) FROM ddt      WHERE id_fornitore = $1) AS n_ddt,
            (SELECT COUNT(*) FROM fatture  WHERE id_fornitore = $1) AS n_fatture
        """,
        id,
    )
    blocchi = []
    if counts["n_ordini"]:  blocchi.append(f"{counts['n_ordini']} ordini")
    if counts["n_ddt"]:     blocchi.append(f"{counts['n_ddt']} DDT")
    if counts["n_fatture"]: blocchi.append(f"{counts['n_fatture']} fatture")
    if blocchi:
        raise HTTPException(
            422,
            detail=f"Impossibile eliminare '{row['ragione_sociale']}': esistono {', '.join(blocchi)} collegati. Elimina prima i documenti associati.",
        )

    async with conn.transaction():
        await conn.execute("DELETE FROM _sequenze_documenti WHERE id_fornitore = $1", id)
        await conn.execute("DELETE FROM listino_prezzi     WHERE id_fornitore = $1", id)
        await conn.execute("DELETE FROM listino_servizi    WHERE id_fornitore = $1", id)
        await conn.execute("DELETE FROM fornitori          WHERE id = $1", id)

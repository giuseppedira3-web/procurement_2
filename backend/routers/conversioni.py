from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
import asyncpg
from pydantic import ValidationError
from database import get_conn
from schemas import ConversioneCreate, ConversioneUpdate, ConversioneResponse, BulkImportError, BulkImportResult
from bulk import decimal_or_none, make_csv_export, make_csv_template, read_rows, str_or_none

router = APIRouter(prefix="/conversioni-peso", tags=["Conversioni Peso"])

# 1:1 con i campi della tabella conversioni_peso (id_prodotto/id_categoria espressi
# come codice_prodotto/categoria_codice)
IMPORT_TEMPLATE_HEADERS = ["codice_prodotto", "categoria_codice", "da_unita", "a_unita", "fattore_conversione", "note"]

# Mappa colonna file di import -> campo ConversioneCreate
IMPORT_FIELD_MAP = {
    "da_unita": "da_unita",
    "a_unita": "a_unita",
    "fattore_conversione": "fattore_conversione",
    "note": "note",
}

IMPORT_DECIMAL_FIELDS = {"fattore_conversione"}


async def _insert_conversione(conn: asyncpg.Connection, body: ConversioneCreate):
    return await conn.fetchrow(
        """
        INSERT INTO conversioni_peso (
            id_prodotto, id_categoria, da_unita, a_unita, fattore_conversione, note
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        """,
        body.id_prodotto, body.id_categoria, body.da_unita, body.a_unita,
        body.fattore_conversione, body.note,
    )


@router.get("/", response_model=list[ConversioneResponse])
async def list_conversioni(
    id_prodotto: int | None = None,
    id_categoria: int | None = None,
    da_unita: str | None = None,
    limit: int = Query(100, le=10000),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_prodotto is not None:
        params.append(id_prodotto)
        filters.append(f"id_prodotto = ${len(params)}")
    if id_categoria is not None:
        params.append(id_categoria)
        filters.append(f"id_categoria = ${len(params)}")
    if da_unita:
        params.append(da_unita)
        filters.append(f"da_unita = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM conversioni_peso {where} ORDER BY id LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=ConversioneResponse, status_code=201)
async def create_conversione(body: ConversioneCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await _insert_conversione(conn, body)
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/import/template", include_in_schema=False)
async def conversioni_import_template():
    return make_csv_template("template_conversioni_peso.csv", IMPORT_TEMPLATE_HEADERS)


@router.get("/export", include_in_schema=False)
async def export_conversioni(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("""
        SELECT p.codice_prodotto, cat.codice AS categoria_codice,
               cp.da_unita, cp.a_unita, cp.fattore_conversione, cp.note
        FROM conversioni_peso cp
        LEFT JOIN prodotti p ON p.id = cp.id_prodotto
        LEFT JOIN categorie_prodotto cat ON cat.id = cp.id_categoria
        ORDER BY cp.id
    """)
    return make_csv_export("export_conversioni_peso.csv", IMPORT_TEMPLATE_HEADERS, [dict(r) for r in rows])


@router.post("/import", response_model=BulkImportResult)
async def import_conversioni(file: UploadFile = File(...), conn: asyncpg.Connection = Depends(get_conn)):
    rows = await read_rows(file)
    prod_rows = await conn.fetch("SELECT id, codice_prodotto FROM prodotti")
    prod_map = {r["codice_prodotto"].strip().upper(): r["id"] for r in prod_rows}
    cat_rows = await conn.fetch("SELECT id, codice FROM categorie_prodotto")
    cat_map = {r["codice"].strip().upper(): r["id"] for r in cat_rows}

    inseriti = 0
    errori: list[BulkImportError] = []

    for i, row in enumerate(rows, start=2):
        try:
            data = {}
            for csv_field, model_field in IMPORT_FIELD_MAP.items():
                if csv_field not in row:
                    continue
                if model_field in IMPORT_DECIMAL_FIELDS:
                    data[model_field] = decimal_or_none(row[csv_field])
                else:
                    data[model_field] = str_or_none(row[csv_field])

            codice = str_or_none(row.get("codice_prodotto"))
            cat_codice = str_or_none(row.get("categoria_codice"))
            if codice:
                id_prodotto = prod_map.get(codice.strip().upper())
                if id_prodotto is None:
                    raise ValueError(f"codice_prodotto '{codice}' non trovato")
                data["id_prodotto"] = id_prodotto
            if cat_codice:
                id_categoria = cat_map.get(cat_codice.strip().upper())
                if id_categoria is None:
                    raise ValueError(f"categoria_codice '{cat_codice}' non trovata")
                data["id_categoria"] = id_categoria
            if not codice and not cat_codice:
                raise ValueError("specificare codice_prodotto o categoria_codice")

            data = {k: v for k, v in data.items() if v is not None}
            body = ConversioneCreate(**data)
        except ValidationError as e:
            errori.append(BulkImportError(riga=i, errore="; ".join(f"{err['loc'][-1]}: {err['msg']}" for err in e.errors())))
            continue
        except ValueError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))
            continue

        try:
            await _insert_conversione(conn, body)
            inseriti += 1
        except asyncpg.PostgresError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))

    return BulkImportResult(totale_righe=len(rows), inseriti=inseriti, errori=errori)


@router.get("/{id}", response_model=ConversioneResponse)
async def get_conversione(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM conversioni_peso WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=ConversioneResponse)
async def update_conversione(id: int, body: ConversioneUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE conversioni_peso SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_conversione(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM conversioni_peso WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

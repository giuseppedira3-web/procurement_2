from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
import asyncpg
from pydantic import ValidationError
from database import get_conn
from schemas import ProdottoCreate, ProdottoUpdate, ProdottoResponse, BulkImportError, BulkImportResult
from bulk import bool_or_none, decimal_or_none, make_csv_export, make_csv_template, read_rows, str_or_none

router = APIRouter(prefix="/prodotti", tags=["Prodotti"])

IMPORT_FIELDS = [
    "codice_prodotto", "descrizione",
    "spessore_mm", "larghezza_mm", "lunghezza_mm", "diametro_mm",
    "norma", "qualita_acciaio",
    "unita_misura_acquisto", "peso_unitario_kg", "prezzo_riferimento", "categoria_trave", "attivo", "note",
]

# 1:1 con i campi della tabella prodotti (id_categoria espresso come categoria_codice)
IMPORT_TEMPLATE_HEADERS = [
    "codice_prodotto", "descrizione", "categoria_codice",
    "spessore_mm", "larghezza_mm", "lunghezza_mm", "diametro_mm",
    "norma", "qualita_acciaio",
    "unita_misura_acquisto", "peso_unitario_kg", "prezzo_riferimento", "categoria_trave", "attivo", "note",
]

IMPORT_DECIMAL_FIELDS = {"spessore_mm", "larghezza_mm", "lunghezza_mm", "diametro_mm", "peso_unitario_kg", "prezzo_riferimento"}
IMPORT_INT_FIELDS = {"categoria_trave"}

PREZZO_RIF_TEMPLATE_HEADERS = ["codice_prodotto", "descrizione", "prezzo_riferimento"]
CAMPI_PREZZO_VALIDI = {"prezzo_riferimento", "prezzo_s275j0h", "prezzo_s355j2h"}


async def _insert_prodotto(conn: asyncpg.Connection, body: ProdottoCreate):
    return await conn.fetchrow(
        """
        INSERT INTO prodotti (
            codice_prodotto, descrizione, id_categoria,
            spessore_mm, larghezza_mm, lunghezza_mm, diametro_mm,
            norma, qualita_acciaio,
            unita_misura_acquisto, peso_unitario_kg,
            prezzo_riferimento, prezzo_s275j0h, prezzo_s355j2h,
            categoria_trave, attivo, note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *
        """,
        body.codice_prodotto, body.descrizione, body.id_categoria,
        body.spessore_mm, body.larghezza_mm, body.lunghezza_mm, body.diametro_mm,
        body.norma, body.qualita_acciaio,
        body.unita_misura_acquisto, body.peso_unitario_kg,
        body.prezzo_riferimento, body.prezzo_s275j0h, body.prezzo_s355j2h,
        body.categoria_trave, body.attivo, body.note,
    )


@router.get("/", response_model=list[ProdottoResponse])
async def list_prodotti(
    id_categoria: int | None = None,
    attivo: bool | None = None,
    norma: str | None = None,
    qualita_acciaio: str | None = None,
    q: str | None = Query(None, description="Ricerca su codice o descrizione"),
    limit: int = Query(100, le=10000),
    offset: int = Query(0, ge=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if id_categoria is not None:
        params.append(id_categoria)
        filters.append(f"id_categoria = ${len(params)}")
    if attivo is not None:
        params.append(attivo)
        filters.append(f"attivo = ${len(params)}")
    if norma:
        params.append(norma)
        filters.append(f"norma ILIKE ${len(params)}")
    if qualita_acciaio:
        params.append(qualita_acciaio)
        filters.append(f"qualita_acciaio ILIKE ${len(params)}")
    if q:
        params.append(f"%{q}%")
        filters.append(f"(codice_prodotto ILIKE ${len(params)} OR descrizione ILIKE ${len(params)})")

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params += [limit, offset]
    n = len(params)
    rows = await conn.fetch(
        f"SELECT * FROM prodotti {where} ORDER BY codice_prodotto LIMIT ${n-1} OFFSET ${n}",
        *params,
    )
    return [dict(r) for r in rows]


@router.post("/", response_model=ProdottoResponse, status_code=201)
async def create_prodotto(body: ProdottoCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await _insert_prodotto(conn, body)
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/import/template", include_in_schema=False)
async def prodotti_import_template():
    return make_csv_template("template_prodotti.csv", IMPORT_TEMPLATE_HEADERS)


@router.get("/export", include_in_schema=False)
async def export_prodotti(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("""
        SELECT p.codice_prodotto, p.descrizione, cat.codice AS categoria_codice,
               p.spessore_mm, p.larghezza_mm, p.lunghezza_mm, p.diametro_mm,
               p.norma, p.qualita_acciaio,
               p.unita_misura_acquisto, p.peso_unitario_kg, p.prezzo_riferimento,
               p.categoria_trave, p.attivo, p.note
        FROM prodotti p
        LEFT JOIN categorie_prodotto cat ON cat.id = p.id_categoria
        ORDER BY p.codice_prodotto
    """)
    return make_csv_export("export_prodotti.csv", IMPORT_TEMPLATE_HEADERS, [dict(r) for r in rows])


@router.post("/import", response_model=BulkImportResult)
async def import_prodotti(file: UploadFile = File(...), conn: asyncpg.Connection = Depends(get_conn)):
    rows = await read_rows(file)
    cat_rows = await conn.fetch("SELECT id, codice FROM categorie_prodotto")
    cat_map = {r["codice"].strip().upper(): r["id"] for r in cat_rows}

    inseriti = 0
    errori: list[BulkImportError] = []

    for i, row in enumerate(rows, start=2):
        try:
            data = {}
            for f in IMPORT_FIELDS:
                if f not in row:
                    continue
                if f == "attivo":
                    data[f] = bool_or_none(row[f])
                elif f in IMPORT_DECIMAL_FIELDS:
                    data[f] = decimal_or_none(row[f])
                elif f in IMPORT_INT_FIELDS:
                    v = row[f]
                    data[f] = int(v) if v not in (None, "") else None
                else:
                    data[f] = str_or_none(row[f])

            # categoria_codice: se la colonna esiste nel CSV la riga DEVE avere un valore
            if "categoria_codice" in row:
                cat_codice = str_or_none(row["categoria_codice"])
                if not cat_codice:
                    raise ValueError("colonna categoria_codice presente ma valore mancante — compila la categoria per ogni riga")
                id_categoria = cat_map.get(cat_codice.strip().upper())
                if id_categoria is None:
                    raise ValueError(f"categoria_codice '{cat_codice}' non trovata — verifica il codice categoria")
                data["id_categoria"] = id_categoria

            data = {k: v for k, v in data.items() if v is not None}
            body = ProdottoCreate(**data)
        except ValidationError as e:
            errori.append(BulkImportError(riga=i, errore="; ".join(f"{err['loc'][-1]}: {err['msg']}" for err in e.errors())))
            continue
        except ValueError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))
            continue

        try:
            await _insert_prodotto(conn, body)
            inseriti += 1
        except asyncpg.UniqueViolationError:
            errori.append(BulkImportError(riga=i, errore=f"codice_prodotto '{body.codice_prodotto}' già esistente"))
        except asyncpg.PostgresError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))

    return BulkImportResult(totale_righe=len(rows), inseriti=inseriti, errori=errori)


@router.get("/import-prezzo-riferimento/template", include_in_schema=False)
async def prezzo_riferimento_import_template():
    return make_csv_template("template_prezzo_riferimento.csv", PREZZO_RIF_TEMPLATE_HEADERS)


@router.post("/import-prezzo-riferimento", response_model=BulkImportResult)
async def import_prezzo_riferimento(
    id_categoria: int = Query(...),
    campo_prezzo: str = Query("prezzo_riferimento"),
    file: UploadFile = File(...),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Importazione massiva prezzi di listino per qualità.
    campo_prezzo: prezzo_riferimento (default=S235JRH) | prezzo_s275j0h | prezzo_s355j2h"""
    if campo_prezzo not in CAMPI_PREZZO_VALIDI:
        raise HTTPException(400, f"campo_prezzo non valido. Valori ammessi: {', '.join(CAMPI_PREZZO_VALIDI)}")
    cat = await conn.fetchrow("SELECT id, unita_misura_base FROM categorie_prodotto WHERE id = $1", id_categoria)
    if not cat:
        raise HTTPException(404, "Categoria non trovata")

    rows = await read_rows(file)
    inseriti = 0
    errori: list[BulkImportError] = []

    for i, row in enumerate(rows, start=2):
        try:
            codice = str_or_none(row.get("codice_prodotto"))
            if not codice:
                raise ValueError("codice_prodotto mancante")
            prezzo = decimal_or_none(row.get("prezzo_riferimento"))
            if prezzo is None:
                raise ValueError("prezzo_riferimento mancante")
            descrizione = str_or_none(row.get("descrizione"))
        except ValueError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))
            continue

        try:
            existing = await conn.fetchrow("SELECT id FROM prodotti WHERE codice_prodotto = $1", codice)
            if existing:
                await conn.execute(
                    f"UPDATE prodotti SET {campo_prezzo} = $1, descrizione = COALESCE($2, descrizione) WHERE id = $3",
                    prezzo, descrizione, existing["id"],
                )
            else:
                if campo_prezzo != "prezzo_riferimento":
                    raise ValueError(f"prodotto '{codice}' non trovato — per qualità aggiuntive il prodotto deve già esistere")
                if not descrizione:
                    raise ValueError("descrizione obbligatoria per un nuovo prodotto")
                await conn.execute(
                    """
                    INSERT INTO prodotti (codice_prodotto, descrizione, id_categoria, unita_misura_acquisto, prezzo_riferimento)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    codice, descrizione, id_categoria, cat["unita_misura_base"], prezzo,
                )
            inseriti += 1
        except ValueError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))
        except asyncpg.PostgresError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))

    return BulkImportResult(totale_righe=len(rows), inseriti=inseriti, errori=errori)


@router.get("/{id}", response_model=ProdottoResponse)
async def get_prodotto(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM prodotti WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.patch("/{id}", response_model=ProdottoResponse)
async def update_prodotto(id: int, body: ProdottoUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await conn.fetchrow(
        f"UPDATE prodotti SET {sets} WHERE id = $1 RETURNING *",
        id, *updates.values(),
    )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_prodotto(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    result = await conn.execute("DELETE FROM prodotti WHERE id = $1", id)
    if result == "DELETE 0":
        raise HTTPException(404)

import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
import asyncpg
from bulk import decimal_or_none, make_csv_template, read_rows, str_or_none
from database import get_conn
from schemas import (
    BulkImportError,
    BulkImportResult,
    ListinoTubolareCreate,
    ListinoTubolareUpdate,
    ListinoTubolareResponse,
    ListinoTubolarePrezzoUpsert,
    ListinoTubolarePrezzoResponse,
    QualitaTubolare,
)

router = APIRouter(prefix="/listini-tubolare", tags=["Listini Tubolare"])

IMPORT_TEMPLATE_HEADERS = ["CODICE", "QUALITA", "BASE €/M", "EXTRA €/M"]

# Valori ammessi nella colonna QUALITA (normalizzati: maiuscolo, senza spazi
# né trattini) -> qualità di listino_tubolare_prezzi.
QUALITA_DA_TESTO = {
    "S235JRH": "prezzo_riferimento",
    "DX51D": "prezzo_riferimento",
    "S235JRHDX51D": "prezzo_riferimento",
    "S275J0H": "prezzo_s275j0h",
    "S355J2H": "prezzo_s355j2h",
}


def _norm(v: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", v.upper())


def _colonna(row: dict, nome: str):
    """Valore della colonna di template `nome`, confrontando le intestazioni
    normalizzate: tollera maiuscole/minuscole, spazi e un € perso per strada
    dalla codifica del file (es. "Base €/M", "BASE /M", "base_m")."""
    chiave = _norm(nome.replace("€", ""))
    for k, v in row.items():
        if _norm(str(k).replace("€", "")) == chiave:
            return v
    return None


@router.get("/", response_model=list[ListinoTubolareResponse])
async def list_listini_tubolare(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("SELECT * FROM listini_tubolare ORDER BY id DESC")
    return [dict(r) for r in rows]


@router.post("/", response_model=ListinoTubolareResponse, status_code=201)
async def create_listino_tubolare(body: ListinoTubolareCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            "INSERT INTO listini_tubolare (nome, data_inizio, data_fine) VALUES ($1, $2, $3) RETURNING *",
            body.nome, body.data_inizio, body.data_fine,
        )
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    return dict(row)


@router.patch("/{id}", response_model=ListinoTubolareResponse)
async def update_listino_tubolare(id: int, body: ListinoTubolareUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    try:
        row = await conn.fetchrow(
            f"UPDATE listini_tubolare SET {sets} WHERE id = $1 RETURNING *",
            id, *updates.values(),
        )
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, detail=str(e))
    if not row:
        raise HTTPException(404, "Listino non trovato")
    return dict(row)


@router.get("/{id}/prezzi/", response_model=list[ListinoTubolarePrezzoResponse])
async def get_prezzi_listino_tubolare(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    listino = await conn.fetchrow("SELECT id FROM listini_tubolare WHERE id = $1", id)
    if not listino:
        raise HTTPException(404, "Listino non trovato")
    rows = await conn.fetch(
        "SELECT id_prodotto, qualita, prezzo, extra FROM listino_tubolare_prezzi WHERE id_listino = $1",
        id,
    )
    return [dict(r) for r in rows]


@router.post("/{id}/prezzi/", response_model=ListinoTubolarePrezzoResponse, status_code=201)
async def set_prezzo_listino_tubolare(id: int, body: ListinoTubolarePrezzoUpsert, conn: asyncpg.Connection = Depends(get_conn)):
    listino = await conn.fetchrow("SELECT id FROM listini_tubolare WHERE id = $1", id)
    if not listino:
        raise HTTPException(404, "Listino non trovato")
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO listino_tubolare_prezzi (id_listino, id_prodotto, qualita, prezzo, extra)
            VALUES ($1, $2, $3, $4, COALESCE($5, 0))
            ON CONFLICT (id_listino, id_prodotto, qualita)
            DO UPDATE SET prezzo = $4, extra = COALESCE($5, listino_tubolare_prezzi.extra), updated_at = now()
            RETURNING id_prodotto, qualita, prezzo, extra
            """,
            id, body.id_prodotto, body.qualita, body.prezzo, body.extra,
        )
    except asyncpg.ForeignKeyViolationError as e:
        raise HTTPException(422, detail=str(e))
    return dict(row)


@router.get("/import/template", include_in_schema=False)
async def import_template_listino_tubolare():
    return make_csv_template("template_listino_tubolare.csv", IMPORT_TEMPLATE_HEADERS)


@router.post("/{id}/import", response_model=BulkImportResult)
async def import_prezzi_listino_tubolare(
    id: int,
    qualita_default: QualitaTubolare = Query(..., description="Qualità usata per le righe con QUALITA vuota"),
    file: UploadFile = File(...),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Importazione massiva prezzi nel listino tubolare `id`.
    Colonne: CODICE (prodotto TUBOLARE già in anagrafica), QUALITA (opzionale:
    S235JRH/DX51D, S275J0H, S355J2H — vuota = qualita_default, cioè la tab
    attiva), BASE €/M (obbligatoria), EXTRA €/M (vuota = extra invariato,
    0 per una voce nuova)."""
    listino = await conn.fetchrow("SELECT id FROM listini_tubolare WHERE id = $1", id)
    if not listino:
        raise HTTPException(404, "Listino non trovato")

    prodotti = {
        r["codice_prodotto"].upper(): r["id"]
        for r in await conn.fetch(
            """SELECT p.id, p.codice_prodotto FROM prodotti p
               JOIN categorie_prodotto c ON c.id = p.id_categoria
               WHERE c.codice = 'TUBOLARE'"""
        )
    }

    rows = await read_rows(file)
    inseriti = 0
    errori: list[BulkImportError] = []

    for i, row in enumerate(rows, start=2):
        try:
            codice = str_or_none(_colonna(row, "CODICE"))
            if not codice:
                raise ValueError("CODICE mancante")
            id_prodotto = prodotti.get(codice.upper())
            if id_prodotto is None:
                raise ValueError(f"prodotto '{codice}' non trovato tra i TUBOLARE in anagrafica")
            testo_qualita = str_or_none(_colonna(row, "QUALITA"))
            if testo_qualita:
                qualita = QUALITA_DA_TESTO.get(_norm(testo_qualita))
                if qualita is None:
                    raise ValueError(f"QUALITA '{testo_qualita}' non riconosciuta (ammesse: S235JRH, DX51D, S275J0H, S355J2H)")
            else:
                qualita = qualita_default
            base = decimal_or_none(_colonna(row, "BASE €/M"))
            if base is None:
                raise ValueError("BASE €/M mancante")
            extra = decimal_or_none(_colonna(row, "EXTRA €/M"))
        except ValueError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))
            continue

        try:
            await conn.execute(
                """
                INSERT INTO listino_tubolare_prezzi (id_listino, id_prodotto, qualita, prezzo, extra)
                VALUES ($1, $2, $3, $4, COALESCE($5, 0))
                ON CONFLICT (id_listino, id_prodotto, qualita)
                DO UPDATE SET prezzo = $4, extra = COALESCE($5, listino_tubolare_prezzi.extra), updated_at = now()
                """,
                id, id_prodotto, qualita, base, extra,
            )
            inseriti += 1
        except asyncpg.PostgresError as e:
            errori.append(BulkImportError(riga=i, errore=str(e)))

    return BulkImportResult(totale_righe=len(rows), inseriti=inseriti, errori=errori)

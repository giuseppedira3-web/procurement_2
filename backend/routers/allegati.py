import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
import asyncpg
from database import get_conn
from schemas import AllegatoResponse
from config import UPLOAD_DIR

router = APIRouter(prefix="/allegati", tags=["Allegati"])

TIPI_VALIDI = {"ordine", "ddt", "fattura"}


@router.get("/", response_model=list[AllegatoResponse])
async def list_allegati(
    tipo_documento: str | None = None,
    id_documento: int | None = None,
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if tipo_documento:
        if tipo_documento not in TIPI_VALIDI:
            raise HTTPException(422, f"tipo_documento deve essere uno di: {TIPI_VALIDI}")
        params.append(tipo_documento)
        filters.append(f"tipo_documento = ${len(params)}")
    if id_documento is not None:
        params.append(id_documento)
        filters.append(f"id_documento = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = await conn.fetch(
        f"SELECT * FROM allegati {where} ORDER BY uploaded_at DESC", *params
    )
    return [dict(r) for r in rows]


@router.post("/upload", response_model=AllegatoResponse, status_code=201)
async def upload_allegato(
    tipo_documento: str = Query(...),
    id_documento: int = Query(...),
    file: UploadFile = File(...),
    conn: asyncpg.Connection = Depends(get_conn),
):
    if tipo_documento not in TIPI_VALIDI:
        raise HTTPException(422, f"tipo_documento deve essere uno di: {TIPI_VALIDI}")

    dest_dir = os.path.join(UPLOAD_DIR, tipo_documento, str(id_documento))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, file.filename)

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = os.path.getsize(dest_path)
    row = await conn.fetchrow(
        """
        INSERT INTO allegati (tipo_documento, id_documento, nome_file, percorso_file, dimensione_bytes, mime_type)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        """,
        tipo_documento, id_documento, file.filename, dest_path, size, file.content_type,
    )
    return dict(row)


@router.get("/{id}", response_model=AllegatoResponse)
async def get_allegato(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT * FROM allegati WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.delete("/{id}", status_code=204)
async def delete_allegato(id: int, conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow("SELECT percorso_file FROM allegati WHERE id = $1", id)
    if not row:
        raise HTTPException(404)
    try:
        os.remove(row["percorso_file"])
    except FileNotFoundError:
        pass
    await conn.execute("DELETE FROM allegati WHERE id = $1", id)

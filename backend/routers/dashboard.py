from fastapi import APIRouter, Depends, Query
import asyncpg
from database import get_conn

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Report"])


@router.get("/stato-ordini")
async def stato_ordini(
    id_fornitore: int | None = None,
    stato: str | None = None,
    anno: int | None = None,
    ditta: str | None = None,
    limit: int = Query(100, le=1000),
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
    if anno:
        params.append(anno)
        filters.append(f"anno = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params.append(limit)
    rows = await conn.fetch(
        f"SELECT * FROM v_stato_ordini {where} ORDER BY data_ordine DESC LIMIT ${len(params)}",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/scostamenti-prezzi")
async def scostamenti_prezzi(
    id_fornitore: int | None = None,
    ditta: str | None = None,
    solo_scostamenti: bool = Query(False, description="Mostra solo righe con delta prezzo != 0"),
    limit: int = Query(200, le=1000),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"ditta = ${len(params)}")
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    if solo_scostamenti:
        filters.append("delta_prezzo != 0")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    params.append(limit)
    rows = await conn.fetch(
        f"SELECT * FROM v_scostamenti_prezzi {where} ORDER BY ABS(delta_importo) DESC LIMIT ${len(params)}",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/ddt-non-fatturati")
async def ddt_non_fatturati(
    id_fornitore: int | None = None,
    ditta: str | None = None,
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"ditta = ${len(params)}")
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = await conn.fetch(
        f"SELECT * FROM v_ddt_non_fatturati {where} ORDER BY data_ricezione DESC",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/esposizione-fornitori")
async def esposizione_fornitori(
    id_fornitore: int | None = None,
    ditta: str | None = None,
    urgenza: str | None = Query(None, description="scaduta | in_scadenza | futura"),
    conn: asyncpg.Connection = Depends(get_conn),
):
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"ditta = ${len(params)}")
    if id_fornitore is not None:
        params.append(id_fornitore)
        filters.append(f"id_fornitore = ${len(params)}")
    if urgenza:
        params.append(urgenza)
        filters.append(f"urgenza = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    rows = await conn.fetch(
        f"SELECT * FROM v_esposizione_fornitore {where}",
        *params,
    )
    return [dict(r) for r in rows]

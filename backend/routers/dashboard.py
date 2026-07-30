from fastapi import APIRouter, Depends, Query
import asyncpg
from database import get_conn
from routers.auth import require_admin

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Report"])

CATEGORIE_CORE = ("LAMIERA", "MERCANTILE", "TRAVI", "TUBOLARE")


@router.get("/totali-ordini")
async def totali_ordini(
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso (kg) e importo totali ordinati, sommati dalle righe ordine. Solo admin."""
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    row = await conn.fetchrow(
        f"""SELECT COALESCE(SUM(r.quantita_kg), 0)   AS peso_totale_kg,
                   COALESCE(SUM(r.importo_riga), 0)   AS importo_totale
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            {where}""",
        *params,
    )
    return dict(row)


@router.get("/ordini-categoria-mensile")
async def ordini_categoria_mensile(
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso e importo ordinati per categoria prodotto core (LAMIERA, MERCANTILE,
    TRAVI, TUBOLARE), aggregati per mese, sugli ultimi 12 mesi (mese corrente incluso).
    Solo admin.
    """
    filters, params = [
        "cp.codice = ANY($1)",
        "o.data_ordine >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'",
    ], [list(CATEGORIE_CORE)]
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = "WHERE " + " AND ".join(filters)
    rows = await conn.fetch(
        f"""SELECT to_char(date_trunc('month', o.data_ordine), 'YYYY-MM') AS mese,
                   cp.codice                                              AS categoria,
                   COALESCE(SUM(r.quantita_kg), 0)                        AS peso_kg,
                   COALESCE(SUM(r.importo_riga), 0)                       AS importo
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            JOIN prodotti p ON p.id = r.id_prodotto
            JOIN categorie_prodotto cp ON cp.id = p.id_categoria
            {where}
            GROUP BY 1, 2
            ORDER BY 1, 2""",
        *params,
    )
    return [dict(r) for r in rows]


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

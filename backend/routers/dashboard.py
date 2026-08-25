from decimal import Decimal

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
    """Peso (kg) e importo totali ordinati/consegnati/da ricevere, sommati dalle
    righe ordine. Consegnato e da ricevere sono stimati proporzionalmente alla
    quantità consegnata rispetto a quella ordinata (non è tracciato un peso/
    importo consegnato indipendente per riga). Solo admin."""
    filters, params = [], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    row = await conn.fetchrow(
        f"""SELECT
                COALESCE(SUM(r.quantita_kg), 0) AS peso_ordinato_kg,
                COALESCE(SUM(r.quantita_kg * r.quantita_consegnata / NULLIF(r.quantita_ordinata, 0)), 0) AS peso_consegnato_kg,
                COALESCE(SUM(r.importo_riga), 0) AS importo_ordinato,
                COALESCE(SUM(r.importo_riga * r.quantita_consegnata / NULLIF(r.quantita_ordinata, 0)), 0) AS importo_consegnato
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            {where}""",
        *params,
    )
    d = dict(row)
    d["peso_da_ricevere_kg"] = max(d["peso_ordinato_kg"] - d["peso_consegnato_kg"], Decimal(0))
    d["importo_da_ricevere"] = max(d["importo_ordinato"] - d["importo_consegnato"], Decimal(0))
    return d


@router.get("/ordini-categoria-mensile")
async def ordini_categoria_mensile(
    ditta: str | None = None,
    mesi: int = Query(12, ge=1, le=36, description="Ampiezza finestra, mese corrente incluso"),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso e importo ordinati per categoria prodotto core (LAMIERA, MERCANTILE,
    TRAVI, TUBOLARE), aggregati per mese, sugli ultimi `mesi` mesi (mese corrente
    incluso, default 12). Solo admin.
    """
    filters, params = [
        "cp.codice = ANY($1)",
        "o.data_ordine >= date_trunc('month', CURRENT_DATE) - ($2 * INTERVAL '1 month')",
    ], [list(CATEGORIE_CORE), mesi - 1]
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


@router.get("/quantita-prezzo-mensile")
async def quantita_prezzo_mensile(
    categoria: str = "MERCANTILE",
    ditta: str | None = None,
    mesi: int = Query(12, ge=1, le=36, description="Ampiezza finestra, mese corrente incluso"),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso (kg) e prezzo medio ponderato di acquisto per mese, separati fra
    zincato e grezzo (ordini.zincatura), per una categoria a struttura
    "base di mercato + extra di lavorazione" (MERCANTILE, TRAVI).

    Il prezzo mediato è il prezzo netto per kg (base + extra, già scontato,
    più zincatura e trasporto se presenti) meno l'extra di lavorazione
    (prodotti.prezzo_riferimento) — l'unica componente specifica per
    prodotto/qualità e quindi non comparabile fra prodotti diversi.
    prezzo_riferimento è espresso in €/t (come parametro_prezzo), va quindi
    diviso per 1000 per confrontarlo con prezzo_unitario/importo_riga (€/kg).

    Le varianti zincate (codice prodotto con suffisso "Z") spesso non hanno
    un prezzo_riferimento proprio in anagrafica: essendo lo stesso profilo del
    gemello grezzo, si recupera l'extra da quest'ultimo (codice senza "Z",
    stessa categoria). Se anche il gemello grezzo manca, la riga viene esclusa
    dal calcolo del prezzo (non c'è un extra da sottrarre in modo affidabile),
    ma resta conteggiata nel peso_kg — che non dipende dall'extra. Solo admin.
    """
    filters, params = [
        "cp.codice = $1",
        "o.data_ordine >= date_trunc('month', CURRENT_DATE) - ($2 * INTERVAL '1 month')",
        "r.quantita_kg > 0",
    ], [categoria, mesi - 1]
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = "WHERE " + " AND ".join(filters)
    rows = await conn.fetch(
        f"""WITH righe AS (
                SELECT
                    o.data_ordine,
                    o.zincatura,
                    r.quantita_kg,
                    r.importo_riga,
                    COALESCE(t.prezzo_trasporto_kg, 0)                          AS trasporto_kg,
                    COALESCE(p.prezzo_riferimento, p_grezzo.prezzo_riferimento) AS extra_ton
                FROM ordini_righe r
                JOIN ordini o ON o.id = r.id_ordine
                JOIN prodotti p ON p.id = r.id_prodotto
                JOIN categorie_prodotto cp ON cp.id = p.id_categoria
                LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
                LEFT JOIN prodotti p_grezzo
                       ON p_grezzo.id_categoria = p.id_categoria
                      AND p_grezzo.codice_prodotto = regexp_replace(p.codice_prodotto, 'Z$', '')
                      AND p.prezzo_riferimento IS NULL
                {where}
            )
            SELECT to_char(date_trunc('month', data_ordine), 'YYYY-MM') AS mese,
                   zincatura                                            AS zincato,
                   SUM(quantita_kg)                                     AS peso_kg,
                   SUM(importo_riga + quantita_kg * trasporto_kg - quantita_kg * extra_ton / 1000)
                       FILTER (WHERE extra_ton IS NOT NULL)
                       / NULLIF(SUM(quantita_kg) FILTER (WHERE extra_ton IS NOT NULL), 0)
                                                                         AS prezzo_medio_kg
            FROM righe
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

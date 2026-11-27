from datetime import date
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


_RAGGRUPPAMENTI = {
    # raggruppa_per -> (espressione SQL del gruppo, alias esposto nella risposta)
    # Nota: per MERCANTILE lo zincato si riconosce dal suffisso "Z" nel codice
    # prodotto (come per l'extra_ton sopra), non da ordini.zincatura — quel
    # flag indica il servizio di zincatura in conto lavoro su materiale
    # grezzo (un caso raro/inutilizzato per MERCANTILE) ed è compilato in modo
    # incostante, portando a classificare come "grezzo" acquisti di prodotto
    # già zincato.
    "zincatura":       ("p.codice_prodotto ~ 'Z$'", "zincato"),
    "categoria_trave":  ("p.categoria_trave",  "categoria_trave"),
    "nessuno":          ("true",               "gruppo"),
}


@router.get("/quantita-prezzo-mensile")
async def quantita_prezzo_mensile(
    categoria: str = "MERCANTILE",
    raggruppa_per: str = Query("zincatura", pattern="^(zincatura|categoria_trave|nessuno)$",
                                description="Dimensione di raggruppamento oltre al mese"),
    ditta: str | None = None,
    mesi: int = Query(12, ge=1, le=36, description="Ampiezza finestra, mese corrente incluso"),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso (kg) e prezzo medio ponderato di acquisto per mese, per una
    categoria a struttura "base di mercato + extra di lavorazione"
    (MERCANTILE, TRAVI). `raggruppa_per` seleziona la dimensione aggiuntiva:
    "zincatura" (zincato/grezzo, per MERCANTILE), "categoria_trave" (Cat 0-5,
    per TRAVI) o "nessuno" (tutto in un unico gruppo per mese, per una vista
    aggregata).

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
    gruppo_expr, gruppo_alias = _RAGGRUPPAMENTI[raggruppa_per]
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
                    {gruppo_expr}                                               AS gruppo,
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
                   gruppo                                               AS {gruppo_alias},
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


@router.get("/tubolare-mensile")
async def tubolare_mensile(
    ditta: str | None = None,
    mesi: int = Query(12, ge=1, le=36, description="Ampiezza finestra, mese corrente incluso"),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso (kg) e prezzo medio ponderato di acquisto per mese per la
    categoria TUBOLARE, separati fra zincato e grezzo (codice prodotto con
    suffisso "Z", come per il gemello grezzo del Mercantile — su TUBOLARE lo
    zincato è un prodotto a listino a sé, non un servizio in conto lavoro).

    A differenza di MERCANTILE/TRAVI, ogni tubo ha un prezzo di listino
    assoluto (materiale + lavorazione), senza una scomposizione base/extra:
    non c'è quindi un'unica componente "comparabile" da isolare. Si normalizza
    invece ogni acquisto rispetto al prezzo di un profilo di riferimento
    (Q403 grezzo / Q403Z zincato, tubo quadro 40x40x3, standard di settore):
    prezzo_normalizzato = prezzo netto per kg (incluso trasporto) − delta,
    dove delta = prezzo di listino del profilo acquistato meno quello del
    riferimento, entrambi in €/kg (prezzo di listino = base + extra). Il listino usato per calcolare i prezzi
    (sia del profilo acquistato sia del riferimento) è quello effettivamente
    in vigore alla data dell'ordine, secondo la decorrenza impostata su
    listini_tubolare (data_inizio/data_fine — data_fine NULL = tuttora
    vigente). Ordini fuori da qualunque decorrenza, o profili privi di prezzo
    di listino o di conversione a kg, sono esclusi dalla media del prezzo ma
    restano nel peso_kg. Solo admin.
    """
    filters, params = [
        "cp.codice = 'TUBOLARE'",
        "o.data_ordine >= date_trunc('month', CURRENT_DATE) - ($1 * INTERVAL '1 month')",
        "r.quantita_kg > 0",
    ], [mesi - 1]
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = "WHERE " + " AND ".join(filters)
    rows = await conn.fetch(
        f"""WITH listino_ordine AS (
                -- Listino tubolare in vigore alla data di ogni ordine (il più
                -- recente, se per errore più decorrenze si sovrappongono).
                SELECT DISTINCT ON (o.id) o.id AS id_ordine, l.id AS id_listino
                FROM ordini o
                JOIN listini_tubolare l
                       ON l.data_inizio IS NOT NULL
                      AND o.data_ordine >= l.data_inizio
                      AND (l.data_fine IS NULL OR o.data_ordine < l.data_fine + INTERVAL '1 month')
                ORDER BY o.id, l.data_inizio DESC
            ),
            riferimento AS (
                -- Prezzo €/kg di Q403 (grezzo) e Q403Z (zincato) nel listino di ogni ordine.
                SELECT lo.id_ordine,
                       MAX(CASE WHEN p.codice_prodotto = 'Q403'  THEN (ltp.prezzo + ltp.extra) / NULLIF(cv.fattore_conversione, 0) END) AS prezzo_grezzo_kg,
                       MAX(CASE WHEN p.codice_prodotto = 'Q403Z' THEN (ltp.prezzo + ltp.extra) / NULLIF(cv.fattore_conversione, 0) END) AS prezzo_zincato_kg
                FROM listino_ordine lo
                JOIN listino_tubolare_prezzi ltp ON ltp.id_listino = lo.id_listino AND ltp.qualita = 'prezzo_riferimento'
                JOIN prodotti p ON p.id = ltp.id_prodotto AND p.codice_prodotto IN ('Q403', 'Q403Z')
                JOIN conversioni_peso cv ON cv.id_prodotto = p.id AND cv.da_unita = p.unita_misura_acquisto AND cv.a_unita = 'kg'
                GROUP BY lo.id_ordine
            ),
            prezzi_prodotto AS (
                -- Prezzo di listino €/kg di ciascun profilo, nel listino di ogni ordine.
                SELECT lo.id_ordine, pp.id AS id_prodotto,
                       (ltp.prezzo + ltp.extra) / CASE WHEN pp.unita_misura_acquisto = 'kg' THEN 1 ELSE NULLIF(cv.fattore_conversione, 0) END AS prezzo_listino_kg
                FROM listino_ordine lo
                JOIN listino_tubolare_prezzi ltp ON ltp.id_listino = lo.id_listino AND ltp.qualita = 'prezzo_riferimento'
                JOIN prodotti pp ON pp.id = ltp.id_prodotto
                LEFT JOIN conversioni_peso cv ON cv.id_prodotto = pp.id AND cv.da_unita = pp.unita_misura_acquisto AND cv.a_unita = 'kg'
            ),
            righe AS (
                SELECT
                    o.data_ordine,
                    (p.codice_prodotto ~ 'Z$')                                  AS zincato,
                    r.quantita_kg,
                    r.importo_riga,
                    COALESCE(t.prezzo_trasporto_kg, 0)                         AS trasporto_kg,
                    pp.prezzo_listino_kg
                        - CASE WHEN p.codice_prodotto ~ 'Z$' THEN rif.prezzo_zincato_kg ELSE rif.prezzo_grezzo_kg END
                                                                                AS delta_kg
                FROM ordini_righe r
                JOIN ordini o ON o.id = r.id_ordine
                JOIN prodotti p ON p.id = r.id_prodotto
                JOIN categorie_prodotto cp ON cp.id = p.id_categoria
                LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
                LEFT JOIN prezzi_prodotto pp ON pp.id_ordine = o.id AND pp.id_prodotto = p.id
                LEFT JOIN riferimento rif ON rif.id_ordine = o.id
                {where}
            )
            SELECT to_char(date_trunc('month', data_ordine), 'YYYY-MM') AS mese,
                   zincato,
                   SUM(quantita_kg)                                     AS peso_kg,
                   SUM(importo_riga + quantita_kg * trasporto_kg - quantita_kg * delta_kg)
                       FILTER (WHERE delta_kg IS NOT NULL)
                       / NULLIF(SUM(quantita_kg) FILTER (WHERE delta_kg IS NOT NULL), 0)
                                                                         AS prezzo_medio_kg
            FROM righe
            GROUP BY 1, 2
            ORDER BY 1, 2""",
        *params,
    )
    return [dict(r) for r in rows]


# Qualità che identificano la lamiera di seconda scelta: non entrano né nelle
# quantità né nel prezzo medio (riportate a parte nei contatori).
_QUALITA_SECONDA_SCELTA = {"", "n.a.", "na", "n/a", "libero"}

# La qualità sulle righe d'ordine (anagrafica qualita_acciaio) e quella a
# listino Zincato hanno nomi diversi per le stesse due qualità.
_ALIAS_QUALITA_LISTINO = {"dx51d": "dx51 - s220gd", "s280gd+z": "s280gd"}

# Larghezze standard: nessun extra. 1000/2000 hanno l'extra su categorie_prodotto.
_LARGHEZZE_STANDARD = (Decimal("1250"), Decimal("1500"))


def _dec(txt: str) -> Decimal:
    return Decimal(txt.strip().replace(",", "."))


def _fascia_contiene(label: str, spessore: Decimal) -> bool:
    """Le fasce sono testo: range "1,25 - 1,50" (con spazi) oppure valori
    singoli/accorpati "1.5", "4-5-6" (senza spazi). Confronto esatto sui
    singoli, inclusivo sui range."""
    try:
        if " - " in label:
            lo, hi = (_dec(x) for x in label.split(" - ", 1))
            return lo <= spessore <= hi
        return any(_dec(x) == spessore for x in label.split("-"))
    except Exception:
        return False


@router.get("/lamiera-mensile")
async def lamiera_mensile(
    ditta: str | None = None,
    produttore: str = Query("Arvedi", description="Produttore di cui usare il listino extra"),
    mesi: int = Query(12, ge=1, le=36, description="Ampiezza finestra, mese corrente incluso"),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Peso (kg) e prezzo medio ponderato di acquisto per mese per la
    LAMIERA, ricondotto al prezzo base: prezzo netto per kg (incluso
    trasporto) meno gli extra di listino della riga — spessore (fascia),
    qualità, larghezza (1000/2000 mm) e, per la Decapata, l'extra decapato
    (come nel calcolatore del Listino: Nero + extra spessore + qualità
    [+ decapato]). Gli extra sono in €/ton, quindi /1000 per il confronto
    con i €/kg. Raggruppa per tipologia (Nera/Decapata/Zincata).

    Spessore e larghezza vengono dal prodotto, la qualità dalla riga d'ordine.
    Seconda scelta (qualità vuota/N.a./Libero): esclusa da quantità e media,
    riportata solo nei contatori. Come per il tubolare, se manca anche solo
    uno degli elementi di prezzo la riga è esclusa dalla media ma resta nel
    peso_kg. Ogni gruppo espone contatori (righe/kg considerati ed esclusi,
    con il motivo) per giudicare la genuinità del dato. La Zincata è sempre
    esclusa dalla media: il rivestimento zinco (Z100…Z275), che incide
    sull'extra, non è registrato su prodotto né su riga d'ordine. Solo admin.
    """
    prod = await conn.fetchrow("SELECT id FROM listino_lamiera_produttori WHERE produttore = $1", produttore)
    if not prod:
        return []
    fasce = [dict(r) for r in await conn.fetch(
        "SELECT tipologia, spessore_label, extra_spessore, extra_decapato FROM listino_lamiera_extra_spessore WHERE id_produttore = $1",
        prod["id"])]
    qual = {(r["tipologia"], r["qualita"].strip().lower()): r["extra_qualita"] for r in await conn.fetch(
        "SELECT tipologia, qualita, extra_qualita FROM listino_lamiera_extra_qualita WHERE id_produttore = $1",
        prod["id"])}
    cat = await conn.fetchrow(
        """SELECT extra_l1000_nera, extra_l1000_decapata, extra_l1000_zincata,
                  extra_l2000_nera, extra_l2000_decapata, extra_l2000_zincata
           FROM categorie_prodotto WHERE codice = 'LAMIERA'""")

    filters, params = [
        "cp.codice = 'LAMIERA'",
        "o.data_ordine >= date_trunc('month', CURRENT_DATE) - ($1 * INTERVAL '1 month')",
        "r.quantita_kg > 0",
    ], [mesi - 1]
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    righe = await conn.fetch(
        f"""SELECT to_char(date_trunc('month', o.data_ordine), 'YYYY-MM') AS mese,
                   p.tipologia_lamiera, p.spessore_mm, p.larghezza_mm,
                   r.qualita_acciaio, r.quantita_kg, r.importo_riga,
                   COALESCE(t.prezzo_trasporto_kg, 0) AS trasporto_kg
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            JOIN prodotti p ON p.id = r.id_prodotto
            JOIN categorie_prodotto cp ON cp.id = p.id_categoria
            LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
            WHERE {" AND ".join(filters)}""",
        *params,
    )

    def extra_riga(r):
        """-> (extra €/ton, None) oppure (None, motivo di esclusione)."""
        tip, sp, lg = r["tipologia_lamiera"], r["spessore_mm"], r["larghezza_mm"]
        if tip is None:
            return None, "tipologia non impostata sul prodotto"
        if tip == "Zincata":
            return None, "zincato: rivestimento zinco non rilevabile"
        if sp is None:
            return None, "spessore mancante sul prodotto"
        if lg is None:
            return None, "larghezza mancante sul prodotto"
        tab = "Nera"  # la Decapata usa le tabelle Nera + extra decapato
        fascia = next((f for f in fasce if f["tipologia"] == tab and _fascia_contiene(f["spessore_label"], sp)), None)
        if fascia is None:
            return None, "spessore fuori dalle fasce di listino"
        if fascia["extra_spessore"] is None:
            return None, "extra spessore non valorizzato"
        q = (r["qualita_acciaio"] or "").strip().lower()
        q = _ALIAS_QUALITA_LISTINO.get(q, q)
        if (tab, q) not in qual:
            return None, "qualità non presente a listino"
        if qual[(tab, q)] is None:
            return None, "extra qualità non valorizzato"
        extra = fascia["extra_spessore"] + qual[(tab, q)]
        if tip == "Decapata":
            if fascia["extra_decapato"] is None:
                return None, "extra decapato non valorizzato"
            extra += fascia["extra_decapato"]
        if lg not in _LARGHEZZE_STANDARD:
            if lg not in (Decimal("1000"), Decimal("2000")):
                return None, "larghezza non a listino"
            v = cat[f"extra_l{int(lg)}_{tip.lower()}"] if cat else None
            if v is None:
                return None, "extra larghezza non valorizzato"
            extra += v
        return extra, None

    gruppi: dict = {}
    for r in righe:
        g = gruppi.setdefault((r["mese"], r["tipologia_lamiera"] or "Non classificata"), {
            "mese": r["mese"], "tipologia": r["tipologia_lamiera"] or "Non classificata",
            "peso_kg": Decimal(0), "righe_considerate": 0, "righe_escluse": 0,
            "kg_considerati": Decimal(0), "kg_esclusi": Decimal(0),
            "righe_seconda_scelta": 0, "kg_seconda_scelta": Decimal(0),
            "motivi_esclusione": {}, "_num": Decimal(0),
        })
        kg = r["quantita_kg"]
        if (r["qualita_acciaio"] or "").strip().lower() in _QUALITA_SECONDA_SCELTA:
            g["righe_seconda_scelta"] += 1
            g["kg_seconda_scelta"] += kg
            continue
        g["peso_kg"] += kg
        extra, motivo = extra_riga(r)
        if motivo:
            g["righe_escluse"] += 1
            g["kg_esclusi"] += kg
            g["motivi_esclusione"][motivo] = g["motivi_esclusione"].get(motivo, 0) + 1
            continue
        g["righe_considerate"] += 1
        g["kg_considerati"] += kg
        g["_num"] += r["importo_riga"] + kg * r["trasporto_kg"] - kg * extra / 1000

    out = []
    for key in sorted(gruppi):
        g = gruppi[key]
        num = g.pop("_num")
        g["prezzo_medio_kg"] = num / g["kg_considerati"] if g["kg_considerati"] else None
        out.append(g)
    return out


@router.get("/materiale-in-arrivo")
async def materiale_in_arrivo(
    categoria: str = Query(..., pattern="^(LAMIERA|MERCANTILE|TRAVI|TUBOLARE)$"),
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Righe ordine non ancora completamente consegnate (materiale in arrivo)
    per la categoria core indicata, con quantità residua e prezzo netto
    (importo riga + trasporto, al netto di sconti/zincatura/CBAM già inclusi
    in importo_riga) per riga. L'aggregazione per prodotto è lasciata al
    frontend. Esclude ordini annullati e righe annullate/complete. Solo
    admin."""
    filters, params = [
        "cp.codice = $1",
        "o.stato != 'annullato'",
        "r.stato_riga IN ('aperta', 'parziale')",
        "(r.quantita_ordinata - r.quantita_consegnata) > 0",
    ], [categoria]
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = "WHERE " + " AND ".join(filters)
    rows = await conn.fetch(
        f"""SELECT
                p.id                                            AS id_prodotto,
                p.codice_prodotto,
                p.descrizione                                   AS descrizione_prodotto,
                o.id                                             AS id_ordine,
                o.codice_ordine,
                o.data_ordine,
                o.data_consegna_prevista,
                f.ragione_sociale                                AS fornitore,
                r.unita_misura,
                (r.quantita_ordinata - r.quantita_consegnata)    AS quantita_residua,
                CASE WHEN r.quantita_ordinata > 0 THEN
                    r.quantita_kg * (r.quantita_ordinata - r.quantita_consegnata) / r.quantita_ordinata
                END                                               AS quantita_residua_kg,
                (r.importo_riga + COALESCE(r.quantita_kg, 0) * COALESCE(t.prezzo_trasporto_kg, 0))
                    / NULLIF(r.quantita_ordinata, 0)              AS prezzo_netto_unitario
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            JOIN prodotti p ON p.id = r.id_prodotto
            JOIN categorie_prodotto cp ON cp.id = p.id_categoria
            JOIN fornitori f ON f.id = o.id_fornitore
            LEFT JOIN v_trasporto_righe_ordine t ON t.id_riga_ordine = r.id
            {where}
            ORDER BY p.codice_prodotto, o.data_ordine""",
        *params,
    )
    return [dict(r) for r in rows]


def _filtri_report(id_fornitore, categoria, data_da, data_a, ditta):
    """Filtri comuni ai report stampabili: ordini non annullati, righe non
    annullate, più i filtri opzionali scelti dall'utente."""
    filters, params = ["o.stato != 'annullato'", "r.stato_riga != 'annullata'"], []
    for valore, clausola in (
        (ditta,        "o.ditta = ${}"),
        (id_fornitore, "o.id_fornitore = ANY(${})"),
        (categoria,    "cp.codice = ANY(${})"),
        (data_da,      "o.data_ordine >= ${}"),
        (data_a,       "o.data_ordine <= ${}"),
    ):
        if valore is not None:
            params.append(valore)
            filters.append(clausola.format(len(params)))
    return "WHERE " + " AND ".join(filters), params


# Consegnato = quota proporzionale della riga già arrivata (al massimo 100%);
# residuo = quota ancora attesa, solo per le righe ancora aperte/parziali.
# Ordinato totale = consegnato + residuo.
_QUOTA_CONSEGNATA = "LEAST(r.quantita_consegnata / NULLIF(r.quantita_ordinata, 0), 1)"
_QUOTA_RESIDUA = (
    "CASE WHEN r.stato_riga IN ('aperta', 'parziale') "
    "THEN GREATEST(1 - r.quantita_consegnata / NULLIF(r.quantita_ordinata, 0), 0) ELSE 0 END"
)

_GRUPPI_REPORT = {
    # raggruppa_per -> (colonne SELECT, colonne GROUP/ORDER BY)
    "fornitore":           ("f.ragione_sociale AS fornitore", "f.ragione_sociale"),
    "categoria":           ("cp.codice AS categoria", "cp.codice"),
    "fornitore_categoria": ("f.ragione_sociale AS fornitore, cp.codice AS categoria",
                            "f.ragione_sociale, cp.codice"),
}


@router.get("/report-ordini")
async def report_ordini(
    raggruppa_per: str = Query("fornitore", pattern="^(fornitore|categoria|fornitore_categoria)$"),
    id_fornitore: list[int] | None = Query(None),
    categoria: list[str] | None = Query(None),
    data_da: date | None = None,
    data_a: date | None = None,
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Totali (peso kg e importo) di materiale arrivato, ordinato totale
    (arrivato + da arrivare) e residuo ordini, raggruppati per fornitore e/o
    categoria, per le stampe PDF. Sono contate solo le righe di prodotti a
    catalogo. Come per /totali-ordini, il consegnato è stimato in proporzione
    alla quantità consegnata/ordinata. Solo admin."""
    select, group = _GRUPPI_REPORT[raggruppa_per]
    where, params = _filtri_report(id_fornitore, categoria, data_da, data_a, ditta)
    rows = await conn.fetch(
        f"""SELECT {select},
                   COUNT(DISTINCT o.id)                                                  AS num_ordini,
                   COALESCE(SUM(r.quantita_kg * {_QUOTA_CONSEGNATA}), 0)                 AS peso_arrivato_kg,
                   COALESCE(SUM(r.quantita_kg * {_QUOTA_RESIDUA}), 0)                    AS peso_residuo_kg,
                   COALESCE(SUM(r.importo_riga * {_QUOTA_CONSEGNATA}), 0)                AS importo_arrivato,
                   COALESCE(SUM(r.importo_riga * {_QUOTA_RESIDUA}), 0)                   AS importo_residuo
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            JOIN fornitori f ON f.id = o.id_fornitore
            JOIN prodotti p ON p.id = r.id_prodotto
            JOIN categorie_prodotto cp ON cp.id = p.id_categoria
            {where}
            GROUP BY {group}
            ORDER BY {group}""",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/report-residuo-righe")
async def report_residuo_righe(
    id_fornitore: list[int] | None = Query(None),
    categoria: list[str] | None = Query(None),
    data_da: date | None = None,
    data_a: date | None = None,
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Dettaglio righe ordine ancora da ricevere (residuo > 0), per la stampa
    "residuo ordini". Solo admin."""
    where, params = _filtri_report(id_fornitore, categoria, data_da, data_a, ditta)
    rows = await conn.fetch(
        f"""SELECT f.ragione_sociale                                       AS fornitore,
                   o.id                                                    AS id_ordine,
                   o.codice_ordine,
                   o.data_ordine,
                   COALESCE(r.data_consegna_prevista, o.data_consegna_prevista) AS data_consegna_prevista,
                   cp.codice                                               AS categoria,
                   p.codice_prodotto,
                   p.descrizione                                           AS descrizione_prodotto,
                   r.unita_misura,
                   (r.quantita_ordinata - r.quantita_consegnata)           AS quantita_residua,
                   r.quantita_kg * {_QUOTA_RESIDUA}                        AS peso_residuo_kg,
                   r.importo_riga * {_QUOTA_RESIDUA}                       AS importo_residuo
            FROM ordini_righe r
            JOIN ordini o ON o.id = r.id_ordine
            JOIN fornitori f ON f.id = o.id_fornitore
            JOIN prodotti p ON p.id = r.id_prodotto
            JOIN categorie_prodotto cp ON cp.id = p.id_categoria
            {where}
              AND r.stato_riga IN ('aperta', 'parziale')
              AND r.quantita_ordinata > r.quantita_consegnata
            ORDER BY f.ragione_sociale, o.data_ordine, o.codice_ordine, r.numero_riga""",
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


@router.get("/cbam-ordini")
async def cbam_ordini(
    ditta: str | None = None,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Dettaglio righe di tutti gli ordini con CBAM attivo (fornitore
    extra-UE), con la tariffa e l'importo CBAM di ciascuna riga. Solo admin."""
    filters, params = ["o.cbam = true"], []
    if ditta is not None:
        params.append(ditta)
        filters.append(f"o.ditta = ${len(params)}")
    where = "WHERE " + " AND ".join(filters)
    rows = await conn.fetch(
        f"""SELECT
                o.id                                          AS id_ordine,
                o.codice_ordine,
                o.data_ordine,
                o.stato,
                o.ditta,
                o.prezzo_cbam_kg                               AS prezzo_cbam_ordine,
                f.ragione_sociale                              AS fornitore,
                r.id                                            AS id_riga,
                r.numero_riga,
                p.codice_prodotto,
                p.descrizione                                   AS descrizione_prodotto,
                r.descrizione_libera,
                r.quantita_ordinata,
                r.unita_misura,
                r.quantita_kg,
                r.prezzo_unitario,
                r.prezzo_cbam_kg,
                r.importo_riga,
                COALESCE(r.quantita_kg * r.prezzo_cbam_kg, 0)   AS importo_cbam
            FROM ordini o
            JOIN fornitori f ON f.id = o.id_fornitore
            JOIN ordini_righe r ON r.id_ordine = o.id
            LEFT JOIN prodotti p ON p.id = r.id_prodotto
            {where}
            ORDER BY o.data_ordine DESC, o.numero_progressivo DESC, r.numero_riga""",
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

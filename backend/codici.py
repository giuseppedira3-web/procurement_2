from datetime import date
import asyncpg

TIPI = {"ordine": "OA", "ddt": "DDT", "fattura": "FT"}
TABELLE = {"ordine": "ordini", "ddt": "ddt", "fattura": "fatture"}


async def genera_codice(
    conn: asyncpg.Connection,
    tipo: str,
    id_fornitore: int,
) -> tuple[str, int, int]:
    """
    Ritorna (codice_completo, numero_progressivo, anno).
    Usa next_progressivo() che è atomica e thread-safe.
    """
    anno = date.today().year
    sigla = TIPI[tipo]

    codice_fornitore: str = await conn.fetchval(
        "SELECT codice_fornitore FROM fornitori WHERE id = $1", id_fornitore
    )
    if not codice_fornitore:
        raise ValueError(f"Fornitore con id={id_fornitore} non trovato")

    numero: int = await conn.fetchval(
        "SELECT next_progressivo($1, $2, $3)", id_fornitore, sigla, anno
    )
    codice = f"{codice_fornitore}-{sigla}-{anno}-{numero:04d}"
    return codice, numero, anno

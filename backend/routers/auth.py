from fastapi import APIRouter, Depends, Header, HTTPException, Query
import asyncpg
from database import get_conn
from schemas import LoginRequest, UtenteResponse, LogAttivitaResponse

router = APIRouter(tags=["Autenticazione"])


async def require_admin(
    x_username: str | None = Header(None),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    """Verifica che l'header X-Username appartenga a un admin attivo.

    Non c'e' password: la protezione vale solo dentro una rete locale fidata.
    """
    if not x_username:
        raise HTTPException(401, "Login richiesto")
    row = await conn.fetchrow(
        "SELECT * FROM utenti WHERE username = $1 AND attivo", x_username
    )
    if not row:
        raise HTTPException(401, "Utente sconosciuto o disattivato")
    if row["ruolo"] != "admin":
        raise HTTPException(403, "Riservato agli amministratori")
    return dict(row)


@router.get("/auth/utenti", response_model=list[UtenteResponse])
async def utenti_login(conn: asyncpg.Connection = Depends(get_conn)):
    """Utenti attivi selezionabili nella schermata di login."""
    rows = await conn.fetch("SELECT * FROM utenti WHERE attivo ORDER BY username")
    return [dict(r) for r in rows]


@router.post("/auth/login", response_model=UtenteResponse)
async def login(body: LoginRequest, conn: asyncpg.Connection = Depends(get_conn)):
    """Login senza password: basta lo username di un utente attivo.

    Il tentativo si registra qui (il middleware salta questo percorso,
    perche' solo qui lo username e' nel body e non nell'header).
    """
    row = await conn.fetchrow(
        "SELECT * FROM utenti WHERE username = $1 AND attivo", body.username
    )
    ok = bool(row) and row["password"] == body.password
    await conn.execute(
        "INSERT INTO log_attivita (username, azione, metodo, percorso, codice_stato) "
        "VALUES ($1, 'login', 'POST', '/auth/login', $2)",
        body.username[:50], 200 if ok else 401,
    )
    if not row:
        raise HTTPException(401, "Utente sconosciuto o disattivato")
    if not ok:
        raise HTTPException(401, "Password errata")
    return dict(row)


@router.get("/log-attivita", response_model=list[LogAttivitaResponse], tags=["Log Attivita"])
async def list_log_attivita(
    limit: int = Query(300, le=1000),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Log delle attivita (solo admin), dal piu' recente."""
    rows = await conn.fetch(
        "SELECT * FROM log_attivita ORDER BY created_at DESC, id DESC LIMIT $1", limit
    )
    return [dict(r) for r in rows]

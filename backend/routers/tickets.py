from fastapi import APIRouter, Depends, Header, HTTPException
import asyncpg
from database import get_conn
from schemas import TicketCreate, TicketUpdate, TicketResponse

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.get("/", response_model=list[TicketResponse])
async def list_tickets(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("SELECT * FROM tickets ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/", response_model=TicketResponse, status_code=201)
async def create_ticket(
    body: TicketCreate,
    x_username: str | None = Header(None),
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "INSERT INTO tickets (titolo, testo, username) VALUES ($1, $2, $3) RETURNING *",
        body.titolo, body.testo, x_username,
    )
    return dict(row)


@router.patch("/{id}", response_model=TicketResponse)
async def update_ticket(
    id: int,
    body: TicketUpdate,
    x_username: str | None = Header(None),
    conn: asyncpg.Connection = Depends(get_conn),
):
    if not x_username:
        raise HTTPException(401, "Login richiesto")
    u = await conn.fetchrow(
        "SELECT ruolo FROM utenti WHERE username = $1 AND attivo", x_username
    )
    if not u or u["ruolo"] != "admin":
        raise HTTPException(403, "Solo gli amministratori possono cambiare lo stato")
    if body.status not in ("aperto", "chiuso"):
        raise HTTPException(422, "Status non valido")
    row = await conn.fetchrow(
        "UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *", body.status, id
    )
    if not row:
        raise HTTPException(404, "Ticket non trovato")
    return dict(row)

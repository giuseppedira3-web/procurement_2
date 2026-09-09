from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from database import get_conn
from schemas import QualitaAcciaioCreate, QualitaAcciaioUpdate, QualitaAcciaioResponse

router = APIRouter(prefix="/qualita-acciaio", tags=["Qualità Acciaio"])


@router.get("/", response_model=list[QualitaAcciaioResponse])
async def list_qualita(conn: asyncpg.Connection = Depends(get_conn)):
    rows = await conn.fetch("SELECT * FROM qualita_acciaio ORDER BY nome")
    return [dict(r) for r in rows]


@router.post("/", response_model=QualitaAcciaioResponse, status_code=201)
async def create_qualita(body: QualitaAcciaioCreate, conn: asyncpg.Connection = Depends(get_conn)):
    try:
        row = await conn.fetchrow(
            "INSERT INTO qualita_acciaio (nome, colore) VALUES ($1, $2) RETURNING *",
            body.nome, body.colore,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, f"Qualità '{body.nome}' già esistente")
    return dict(row)


# Rinominare una qualità la ripropaga su prodotti e righe ordine che la usano
# già: sono valori testuali liberi (non FK), quindi senza questo aggiornamento
# a cascata la modifica qui lascerebbe i dati esistenti agganciati al vecchio
# nome. Non esiste un DELETE: rimuovere una qualità in uso romperebbe
# silenziosamente quei riferimenti.
@router.patch("/{id}", response_model=QualitaAcciaioResponse)
async def update_qualita(id: int, body: QualitaAcciaioUpdate, conn: asyncpg.Connection = Depends(get_conn)):
    async with conn.transaction():
        row = await conn.fetchrow("SELECT * FROM qualita_acciaio WHERE id = $1", id)
        if not row:
            raise HTTPException(404)
        vecchio_nome = row["nome"]
        try:
            updated = await conn.fetchrow(
                "UPDATE qualita_acciaio SET nome = $1, colore = $2, updated_at = now() WHERE id = $3 RETURNING *",
                body.nome, body.colore, id,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(409, f"Qualità '{body.nome}' già esistente")
        if body.nome != vecchio_nome:
            await conn.execute(
                "UPDATE prodotti SET qualita_acciaio = $1 WHERE qualita_acciaio = $2",
                body.nome, vecchio_nome,
            )
            await conn.execute(
                "UPDATE ordini_righe SET qualita_acciaio = $1 WHERE qualita_acciaio = $2",
                body.nome, vecchio_nome,
            )
    return dict(updated)

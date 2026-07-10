from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import DATABASE_URL
from database import init_pool
from routers import (
    allegati, auth, categorie, categorie_servizio, conversioni, dashboard,
    ddt, fatture, fornitori, listino, listino_servizi, magazzini, ordini, prodotti, vettori,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await init_pool(DATABASE_URL)
    yield
    await app.state.pool.close()


app = FastAPI(
    title="Procurement Acciaio API",
    version="1.0.0",
    description="Gestione ordini, DDT, fatture e listini per l'ufficio acquisti siderurgico",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_AZIONI = {"POST": "creazione", "PATCH": "modifica", "PUT": "modifica", "DELETE": "eliminazione"}


@app.middleware("http")
async def log_attivita(request: Request, call_next):
    """Registra in log_attivita ogni operazione di scrittura sulle API.

    Le route statiche del frontend rispondono solo a GET, quindi ogni
    POST/PATCH/DELETE e' per definizione una chiamata API.
    """
    response = await call_next(request)
    path = request.url.path
    if request.method in _AZIONI and not path.endswith("/auth/login"):
        try:  # il log non deve mai bloccare l'operazione
            async with app.state.pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO log_attivita (username, azione, metodo, percorso, codice_stato) "
                    "VALUES ($1, $2, $3, $4, $5)",
                    request.headers.get("X-Username"),
                    _AZIONI[request.method],
                    request.method,
                    path[:200],
                    response.status_code,
                )
        except Exception:
            pass
    return response


app.include_router(auth.router)
app.include_router(fornitori.router)
app.include_router(magazzini.router)
app.include_router(vettori.router)
app.include_router(categorie.router)
app.include_router(categorie_servizio.router)
app.include_router(prodotti.router)
app.include_router(conversioni.router)
app.include_router(listino.router)
app.include_router(listino_servizi.router)
app.include_router(ordini.router)
app.include_router(ddt.router)
app.include_router(fatture.router)
app.include_router(allegati.router)
app.include_router(dashboard.router)


@app.get("/health", tags=["Health"])
async def root():
    return {"status": "ok", "app": "Procurement Acciaio API"}


class NoCacheStaticFiles(StaticFiles):
    """Forza la revalidazione ad ogni richiesta, cosi le modifiche al frontend
    sono visibili subito con un semplice reload (l'app e' in sviluppo attivo)."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", NoCacheStaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

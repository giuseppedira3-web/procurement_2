import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Nessun default con credenziali reali: la DATABASE_URL vera sta nel .env
# (mai committato), come da .gitignore.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://procurement_user:cambiami@127.0.0.1:5432/procurement_db",
)
UPLOAD_DIR: str = os.getenv(
    "UPLOAD_DIR",
    str(Path(__file__).resolve().parent.parent / "allegati"),
)

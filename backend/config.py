import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://procurement_user:procurement2026!@127.0.0.1:5432/procurement_db",
)
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/root/procurement/allegati")

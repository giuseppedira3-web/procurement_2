#!/usr/bin/env bash
# Installazione una-tantum su Debian 12+: PostgreSQL, virtualenv Python,
# database (da zero o ripristinando un dati.sql), servizio systemd.
# Rieseguibile senza danni: salta cio' che esiste gia'.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
SERVICE_USER="${SUDO_USER:-$USER}"
DB_NAME="procurement_db"
DB_USER="procurement_user"

echo "============================================"
echo " PROCUREMENT ACCIAIO - Setup iniziale"
echo "============================================"
echo

echo "[1/6] Pacchetti di sistema..."
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql python3-venv curl
sudo systemctl enable --now postgresql

echo "[2/6] Controllo versione Python..."
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    echo "ERRORE: serve Python >= 3.10 (Debian 12 o superiore)."
    exit 1
fi

echo "[3/6] Ambiente Python..."
if [ ! -d .venv ]; then
    python3 -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r backend/requirements.txt

echo "[4/6] Configurazione (backend/.env)..."
if [ -f backend/.env ]; then
    DB_PASS="$(sed -n "s#^DATABASE_URL=postgresql://${DB_USER}:\([^@]*\)@.*#\1#p" backend/.env)"
    if [ -z "$DB_PASS" ]; then
        echo "ERRORE: impossibile leggere la password da backend/.env"
        exit 1
    fi
    echo "  .env esistente, riuso la password attuale."
else
    DB_PASS="acciaio_$(tr -dc 'a-f0-9' </dev/urandom | head -c 16)"
    cat > backend/.env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
UPLOAD_DIR=${PROJECT_DIR}/allegati
EOF
    chmod 600 backend/.env
    echo "  backend/.env creato con password generata."
fi
mkdir -p allegati fatture_xml

echo "[5/6] Database PostgreSQL..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    sudo -u postgres psql -qc "CREATE ROLE ${DB_USER} LOGIN"
fi
sudo -u postgres psql -qc "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
TABLE_COUNT="$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
if [ "$TABLE_COUNT" -eq 0 ]; then
    if [ -f dati.sql ]; then
        echo "  Trovato dati.sql: ripristino il backup..."
        psql -q "$DATABASE_URL" -f dati.sql
    else
        echo "  Creo lo schema da zero (nessun dati.sql trovato)..."
        psql -q "$DATABASE_URL" -f db/schema.sql
        psql -q "$DATABASE_URL" -f db/002_sequenze.sql
        psql -q "$DATABASE_URL" -f db/migration_add_sconti.sql
        for m in db/003_*.sql db/004_*.sql db/005_*.sql db/006_*.sql db/007_*.sql; do
            psql -q "$DATABASE_URL" -f "$m"
        done
    fi
else
    echo "  Database gia' popolato (${TABLE_COUNT} tabelle), non tocco nulla."
fi
# Migrazioni successive al backup: si applicano solo se mancanti. I nomi/
# condizioni qui sotto devono restare allineati ai file in db/ — un
# disallineamento (successo il 2026-08-xx con la rinumerazione 009-013) fa
# fallire un'installazione pulita a meta' script per "file not found".
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='utenti'" | grep -q 1; then
    echo "  Applico la migrazione 008 (utenti + log attivita)..."
    psql -q "$DATABASE_URL" -f db/008_utenti_log_attivita.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='ordini' AND column_name='zincatura'" | grep -q 1; then
    echo "  Applico la migrazione 009 (zincatura su ordini)..."
    psql -q "$DATABASE_URL" -f db/009_ordini_zincatura.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='utenti' AND column_name='password'" | grep -q 1; then
    echo "  Applico la migrazione 010 (password utenti)..."
    psql -q "$DATABASE_URL" -f db/010_utenti_password.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='tickets'" | grep -q 1; then
    echo "  Applico la migrazione 011 (tabella tickets)..."
    psql -q "$DATABASE_URL" -f db/011_tickets.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM utenti WHERE username='giovanni'" | grep -q 1; then
    echo "  Applico la migrazione 012 (utenti giovanni/giuseppe/enzo)..."
    psql -q "$DATABASE_URL" -f db/012_utenti_giovanni_giuseppe_enzo.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='ordini' AND column_name='ditta'" | grep -q 1; then
    echo "  Applico la migrazione 013 (ditta su ordini/ddt/fatture)..."
    psql -q "$DATABASE_URL" -f db/013_ditta_documenti.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='ddt' AND column_name='id_vettore'" | grep -q 1; then
    echo "  Applico la migrazione 014 (ddt.id_vettore al posto di ddt.vettore)..."
    psql -q "$DATABASE_URL" -f db/014_ddt_id_vettore.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM categorie_prodotto WHERE codice='COILS'" | grep -q 1; then
    echo "  Applico la migrazione 015 (categoria COILS)..."
    psql -q "$DATABASE_URL" -f db/015_categoria_coils.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='ddt' AND column_name='costo_trasporto'" | grep -q 1; then
    echo "  Applico la migrazione 016 (costo trasporto DDT)..."
    psql -q "$DATABASE_URL" -f db/016_ddt_costo_trasporto.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='v_stato_ordini' AND column_name='ha_righe_aperte'" | grep -q 1; then
    echo "  Applico la migrazione 017 (v_stato_ordini.ha_righe_aperte)..."
    psql -q "$DATABASE_URL" -f db/017_stato_ordini_righe_aperte.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM categorie_prodotto WHERE codice='OMEGA'" | grep -q 1; then
    echo "  Applico la migrazione 018 (categoria OMEGA)..."
    psql -q "$DATABASE_URL" -f db/018_categoria_omega.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='listini_tubolare'" | grep -q 1; then
    echo "  Applico la migrazione 019 (listini tubolare multipli)..."
    psql -q "$DATABASE_URL" -f db/019_listini_tubolare.sql
fi
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name='ordini' AND column_name='cbam'" | grep -q 1; then
    echo "  Applico la migrazione 020 (CBAM su ordini)..."
    psql -q "$DATABASE_URL" -f db/020_ordini_cbam.sql
fi

echo "[6/6] Servizio systemd..."
sed -e "s|__DIR__|${PROJECT_DIR}|g" -e "s|__USER__|${SERVICE_USER}|g" \
    deploy/procurement.service | sudo tee /etc/systemd/system/procurement.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now procurement
sudo systemctl restart procurement
sleep 2

echo
if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "============================================"
    echo " Setup completato! Sistema in esecuzione."
    echo " Interfaccia web:  http://localhost:8000"
    echo " Documentazione:   http://localhost:8000/docs"
    echo "============================================"
else
    echo "ATTENZIONE: il servizio non risponde ancora su /health."
    echo "Controlla con: sudo systemctl status procurement"
    echo "Log:           sudo journalctl -u procurement -e"
    exit 1
fi

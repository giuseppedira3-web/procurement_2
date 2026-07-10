#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -f /etc/systemd/system/procurement.service ]; then
    echo "Servizio non installato. Esegui prima: ./setup.sh"
    exit 1
fi

sudo systemctl start procurement
sleep 1

if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "Sistema avviato: http://localhost:8000"
else
    echo "Il servizio e' partito ma non risponde ancora su /health."
    echo "Controlla con: sudo systemctl status procurement"
    exit 1
fi

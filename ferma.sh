#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
sudo systemctl stop procurement
echo "API arrestata. I dati sono preservati (PostgreSQL resta attivo)."

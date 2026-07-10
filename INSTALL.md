# Manuale d'installazione — Procurement Acciaio su una nuova macchina Debian

Porta una macchina Debian pulita ad avere Procurement Acciaio in
esecuzione come servizio (con i dati migrati dalla vecchia macchina,
se servono). Tempo richiesto: circa 10 minuti.

---

## 1. Requisiti

- **Debian 12 o superiore** (serve Python ≥ 3.10; Debian 11 non basta)
- Un utente con privilegi **sudo**
- Connessione a Internet (per i pacchetti)
- Porta **8000** libera — serve sia l'API che l'interfaccia web

---

## 2. Esportare i dati dalla vecchia macchina (se servono)

Sulla vecchia macchina, dalla cartella del progetto — operazione di sola
lettura, non tocca il servizio in esecuzione:

```bash
sudo -u postgres pg_dump procurement_db > dati.sql
```

Il file `dati.sql` va messo **nella cartella del progetto** che copierai
al passo 3: `setup.sh` lo trova e lo ripristina da solo.

> Se parti da zero (nessun dato da migrare), salta questo passo:
> lo schema viene creato vuoto con tutte le migrazioni.

---

## 3. Portare il progetto sulla nuova macchina

### Opzione A — con git (consigliata)
```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/giuseppedira3-web/procurement_2.git ~/procurement
cd ~/procurement
# se hai un dati.sql dal passo 2, copialo qui adesso
```
Il repo è privato: al clone servono username GitHub e un token
(fine-grained, sola lettura sul repo — GitHub → Settings →
Developer settings → Fine-grained tokens).

### Opzione B — copia diretta (scp / chiavetta)
```bash
scp -r procurement_2/ utente@nuova-macchina:~/procurement
```
Con questa strada il `dati.sql` può già essere dentro la cartella.
Se i permessi si perdono (chiavette FAT): `chmod +x setup.sh avvia.sh ferma.sh`

> **Nota:** `backend/.env` (password del database) non è nel repository.
> Se non c'è, `setup.sh` lo genera con una password nuova — va bene così.

---

## 4. Installazione

```bash
./setup.sh
```

Lo script chiede la password sudo e in sequenza:

| Passo | Cosa fa |
|-------|---------|
| 1/6 | Installa PostgreSQL, `python3-venv` e `curl` |
| 2/6 | Verifica Python ≥ 3.10 |
| 3/6 | Crea il virtualenv `.venv` con le dipendenze |
| 4/6 | Genera `backend/.env` (o riusa quello esistente); crea le cartelle `allegati/` e `fatture_xml/` |
| 5/6 | Crea utente e database; **ripristina `dati.sql` se presente**, altrimenti crea lo schema con tutte le migrazioni; applica la migrazione 008 (utenti + log attività) se manca |
| 6/6 | Installa e avvia il servizio systemd `procurement` |

Al termine deve comparire **"Setup completato! Sistema in esecuzione."**
Lo script è rieseguibile: se si interrompe, sistemata la causa basta rilanciarlo.

---

## 5. Verifica

```bash
curl http://localhost:8000/health     # → {"status":"ok","app":"Procurement Acciaio API"}
sudo systemctl status procurement     # → active (running)
```

Dal browser di un PC in rete: **`http://IP-DELLA-MACCHINA:8000`** —
l'interfaccia web è servita direttamente dall'applicazione, non serve
configurare nulla sul PC client. Comparirà la schermata di login:
utenti iniziali **admin** (amministratore, vede anche il Log Attività)
e **operatore**.

Se il firewall della macchina è attivo, apri la porta 8000 alla LAN:
```bash
sudo ufw allow from 192.168.1.0/24 to any port 8000   # solo se usi ufw
```

Riavvia la macchina e ricontrolla `/health`: il servizio deve ripartire da solo.

---

## 6. Gestione quotidiana

| Azione | Comando |
|--------|---------|
| Stato | `sudo systemctl status procurement` |
| Avvia / Ferma | `./avvia.sh` / `./ferma.sh` |
| Riavvia | `sudo systemctl restart procurement` |
| Log applicazione | `sudo journalctl -u procurement -f` |
| Log attività utenti | interfaccia web → Sistema → Log Attività (solo admin) |

Per aggiungere un utente dell'applicazione:
```bash
sudo -u postgres psql procurement_db -c \
  "INSERT INTO utenti (username, nome_completo, ruolo) VALUES ('mrossi','Mario Rossi','operatore')"
```
(ruoli possibili: `operatore`, `admin`)

---

## 7. Backup

### Manuale
```bash
sudo -u postgres pg_dump procurement_db > backup_$(date +%Y%m%d).sql
```
Gli allegati caricati (DDT, fatture XML) sono file su disco: includi
nel backup anche le cartelle `allegati/` e `fatture_xml/`.

### Automatico giornaliero (consigliato)
```bash
sudo crontab -e
```
```
30 2 * * * su postgres -c "pg_dump procurement_db" > /var/backups/acciaio_$(date +\%Y\%m\%d).sql && find /var/backups -name "acciaio_*.sql" -mtime +30 -delete
```

### Ripristino
```bash
sudo systemctl stop procurement
sudo -u postgres psql -c "DROP DATABASE procurement_db"
sudo -u postgres createdb -O procurement_user procurement_db
sudo -u postgres psql procurement_db < backup_20260710.sql
sudo systemctl start procurement
```

---

## 8. Aggiornamento dell'applicazione

```bash
cd ~/procurement
git pull
.venv/bin/pip install -r backend/requirements.txt   # solo se cambiano le dipendenze
sudo systemctl restart procurement
```
Se la nuova versione porta migrazioni nuove in `db/` (file `009_...` in
poi), applicale prima del restart:
```bash
sudo -u postgres psql procurement_db -f db/009_nome_migrazione.sql
```

---

## 9. Risoluzione problemi

| Sintomo | Verifica / rimedio |
|---------|-------------------|
| `/health` non risponde | `sudo systemctl status procurement`, poi `sudo journalctl -u procurement -e` |
| Il servizio muore subito | Quasi sempre database: `sudo systemctl status postgresql` |
| `password authentication failed` | La password in `backend/.env` non coincide col ruolo PostgreSQL: rilancia `./setup.sh` (riallinea) |
| Errore di sintassi Python all'avvio | Python < 3.10: la macchina è troppo vecchia (serve Debian 12+) |
| Dal PC client non si apre la pagina | `curl http://IP:8000/health` dal client; se non risponde è firewall o rete |
| Login non compare / errore utenti | Manca la migrazione 008: rilancia `./setup.sh` |
| Setup interrotto a metà | Rilancia `./setup.sh`: è idempotente |

---

## 10. Spegnere la vecchia macchina

Solo quando la nuova è verificata (dati presenti, ordini consultabili,
un giro completo di prova fatto):

```bash
# sulla vecchia macchina
sudo systemctl disable --now procurement
```

Tieni il suo ultimo `dati.sql` da parte per qualche settimana come rete
di sicurezza.

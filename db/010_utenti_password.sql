-- =============================================================================
-- 010 — UTENTI: colonna password (usata da routers/auth.py e dal frontend,
-- ma mai aggiunta da una migration committata; la 008 la dava per "senza
-- password" ma login/frontend la richiedono sempre)
--
-- ATTENZIONE: il confronto in auth.py e' in chiaro (row["password"] ==
-- body.password), quindi qui la password e' salvata in chiaro. Da valutare
-- un hashing (bcrypt/argon2) lato codice in futuro.
-- =============================================================================

ALTER TABLE utenti
    ADD COLUMN IF NOT EXISTS password VARCHAR(100);

-- Password temporanea = username, solo per sbloccare il primo accesso.
-- Da cambiare appena possibile.
UPDATE utenti SET password = username WHERE password IS NULL;

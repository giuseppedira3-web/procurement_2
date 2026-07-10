-- =============================================================================
-- 008 — Utenti (login senza password, solo rete locale) + Log attivita
-- =============================================================================

CREATE TABLE utenti (
    id             SERIAL       PRIMARY KEY,
    username       VARCHAR(50)  UNIQUE NOT NULL,
    nome_completo  VARCHAR(100),
    ruolo          VARCHAR(20)  NOT NULL DEFAULT 'operatore'
                   CHECK (ruolo IN ('admin', 'operatore')),
    attivo         BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Registra login e tutte le operazioni di scrittura via API
CREATE TABLE log_attivita (
    id            SERIAL       PRIMARY KEY,
    username      VARCHAR(50),                 -- NULL = richiesta anonima
    azione        VARCHAR(20)  NOT NULL,       -- login / creazione / modifica / eliminazione
    metodo        VARCHAR(10)  NOT NULL,       -- POST / PATCH / DELETE
    percorso      VARCHAR(200) NOT NULL,       -- es. /ordini/
    codice_stato  INTEGER      NOT NULL,
    dettaglio     TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_log_attivita_created ON log_attivita(created_at DESC);

INSERT INTO utenti (username, nome_completo, ruolo) VALUES
    ('admin',     'Amministratore', 'admin'),
    ('operatore', 'Operatore',      'operatore');

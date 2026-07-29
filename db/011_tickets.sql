-- =============================================================================
-- 011 — Tabella tickets
--
-- Già presente sul database di produzione (creata a mano in passato, mai
-- registrata in una migrazione versionata). IF NOT EXISTS rende questo
-- script un no-op dove la tabella esiste già, e la crea da zero sulle
-- installazioni nuove.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tickets (
    id          SERIAL       PRIMARY KEY,
    titolo      VARCHAR(200) NOT NULL,
    testo       TEXT         NOT NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'aperto'
                CHECK (status IN ('aperto', 'chiuso')),
    username    VARCHAR(50),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

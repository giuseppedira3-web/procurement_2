-- =============================================================================
-- 009 — Password utenti + tabella tickets
--
-- Queste modifiche sono già presenti sul database di produzione (create a
-- mano in passato, mai registrate in una migrazione versionata). Questo
-- script allinea lo schema versionato alla realtà: IF NOT EXISTS rende tutto
-- un no-op dove gli oggetti esistono già, e li crea da zero sulle
-- installazioni nuove.
-- =============================================================================

ALTER TABLE utenti ADD COLUMN IF NOT EXISTS password VARCHAR(100) DEFAULT 'Password';

CREATE TABLE IF NOT EXISTS tickets (
    id          SERIAL       PRIMARY KEY,
    titolo      VARCHAR(200) NOT NULL,
    testo       TEXT         NOT NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'aperto'
                CHECK (status IN ('aperto', 'chiuso')),
    username    VARCHAR(50),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

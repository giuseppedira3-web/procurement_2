-- =============================================================================
-- 010 — Zincatura su ordini/righe ordine
--
-- Queste colonne sono già presenti sul database di produzione (aggiunte a
-- mano in passato, mai registrate in una migrazione versionata). Questo
-- script allinea lo schema versionato alla realtà: usa IF NOT EXISTS così è
-- un no-op dove le colonne esistono già, e crea da zero le colonne mancanti
-- sulle installazioni nuove.
-- =============================================================================

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS zincatura     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS id_zincheria  INTEGER REFERENCES fornitori(id);

ALTER TABLE ordini_righe
    ADD COLUMN IF NOT EXISTS qualita_acciaio        VARCHAR(50),
    ADD COLUMN IF NOT EXISTS lunghezza_mm            NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS tolleranza_chiusura_kg  NUMERIC(10,2) NOT NULL DEFAULT 250.00,
    ADD COLUMN IF NOT EXISTS id_listino_zincatura    INTEGER REFERENCES listino_servizi(id),
    ADD COLUMN IF NOT EXISTS prezzo_zincatura        NUMERIC(14,6);

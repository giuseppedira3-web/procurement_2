-- =============================================================================
-- 029 — QUALITA_ACCIAIO: colore badge personalizzabile
--
-- Finora il colore del badge qualità era calcolato solo lato frontend (mappa
-- fissa + hash come fallback, in utils.js). Ora ogni qualità porta un colore
-- esadecimale esplicito, modificabile dal tab Qualità con un color picker
-- libero: niente vincolo a una palette fissa né a codici RAL (pensati per
-- vernici fisiche, non aggiungono nulla per un badge a schermo). Le 13
-- qualità esistenti sono backfillate con l'equivalente hex del colore che
-- avevano già lato frontend, per non cambiare l'aspetto attuale.
-- =============================================================================

BEGIN;

ALTER TABLE qualita_acciaio
    ADD COLUMN IF NOT EXISTS colore VARCHAR(7) NOT NULL DEFAULT '#6c757d';

UPDATE qualita_acciaio SET colore = CASE nome
    WHEN 'S235JRH'             THEN '#0d6efd'
    WHEN 'DX51D'               THEN '#6c757d'
    WHEN 'S275JRH'             THEN '#198754'
    WHEN 'S275J0H'             THEN '#198754'
    WHEN 'S275J2H'             THEN '#ffc107'
    WHEN 'S355J0H'             THEN '#fd7e14'
    WHEN 'S355J2H'             THEN '#dc3545'
    WHEN 'S280GD+Z'            THEN '#6f42c1'
    WHEN 'DD11'                THEN '#0dcaf0'
    WHEN 'DC01'                THEN '#212529'
    WHEN 'N.a.'                THEN '#f8f9fa'
    WHEN 'Libero'              THEN '#6c757d'
    WHEN 'S355JOWPH - CORTEN'  THEN '#a0522d'
    ELSE colore
END;

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('qualita_acciaio', 'colore', 'VARCHAR(7)',
 'Colore esadecimale (#rrggbb) del badge qualità, libero via color picker, non vincolato a una palette', '#0d6efd', true);

COMMIT;

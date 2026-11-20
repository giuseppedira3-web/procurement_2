-- =============================================================================
-- 037 — LISTINI TUBOLARE: base ed extra a 3 decimali
--
-- Base (prezzo) ed extra del listino tubolare si esprimono in €/m con 3
-- decimali (es. extra 0,325). Le colonne passano da NUMERIC(14,6) a
-- NUMERIC(14,3): i valori esistenti vengono arrotondati al millesimo e da qui
-- in poi PostgreSQL arrotonda al millesimo qualunque valore inserito.
-- Il cast ::numeric rende la migrazione valida anche se in qualche ambiente
-- la colonna extra fosse stata creata con un tipo intero.
-- =============================================================================

BEGIN;

ALTER TABLE listino_tubolare_prezzi
    ALTER COLUMN prezzo TYPE NUMERIC(14,3) USING ROUND(prezzo::numeric, 3),
    ALTER COLUMN extra  TYPE NUMERIC(14,3) USING ROUND(extra::numeric, 3);

UPDATE _dizionario_dati
   SET data_type = 'NUMERIC(14,3)',
       esempio   = CASE column_name WHEN 'prezzo' THEN '4.490' ELSE '0.150' END
 WHERE table_name = 'listino_tubolare_prezzi' AND column_name IN ('prezzo', 'extra');

COMMIT;

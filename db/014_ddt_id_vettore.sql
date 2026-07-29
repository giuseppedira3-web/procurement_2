-- =============================================================================
-- 013 — DDT: sostituisce il campo testo libero "vettore" con "id_vettore"
--        (FK alla tabella vettori), come già fatto per gli ordini.
--
-- Evita il disallineamento per cui correggere un vettore in anagrafica non si
-- riflette sui DDT già inseriti. Backfill: per ogni valore distinto già
-- presente in ddt.vettore, riusa il vettore esistente con lo stesso nome
-- (case-insensitive) o ne crea uno nuovo, poi collega tutti i DDT via FK.
-- =============================================================================

ALTER TABLE ddt ADD COLUMN IF NOT EXISTS id_vettore INTEGER REFERENCES vettori(id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ddt' AND column_name = 'vettore'
    ) THEN
        INSERT INTO vettori (ragione_sociale)
        SELECT DISTINCT trim(d.vettore)
        FROM ddt d
        WHERE d.vettore IS NOT NULL AND trim(d.vettore) <> ''
          AND NOT EXISTS (
              SELECT 1 FROM vettori v WHERE lower(trim(v.ragione_sociale)) = lower(trim(d.vettore))
          );

        UPDATE ddt d
        SET id_vettore = v.id
        FROM vettori v
        WHERE d.vettore IS NOT NULL AND trim(d.vettore) <> ''
          AND lower(trim(v.ragione_sociale)) = lower(trim(d.vettore));

        ALTER TABLE ddt DROP COLUMN vettore;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ddt_vettore ON ddt(id_vettore);

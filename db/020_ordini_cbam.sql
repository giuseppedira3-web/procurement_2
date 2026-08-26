-- =============================================================================
-- 020 — ORDINI: CBAM (Carbon Border Adjustment Mechanism) per fornitori esteri
--
-- Come la zincatura: un flag di testata ordine attiva un costo aggiuntivo.
-- A differenza della zincatura (prezzo per riga scelto da un listino
-- zincheria), il CBAM è un'unica tariffa €/kg per l'intero ordine: si
-- imposta una volta in testata e viene ereditata da ogni riga al momento
-- del salvataggio, sommandosi al prezzo materiale come la zincatura.
-- =============================================================================

BEGIN;

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS cbam BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS prezzo_cbam_kg NUMERIC(14,6);

ALTER TABLE ordini_righe
    ADD COLUMN IF NOT EXISTS prezzo_cbam_kg NUMERIC(14,6);

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('ordini', 'cbam', 'BOOLEAN',
 'Ordine soggetto a CBAM (Carbon Border Adjustment Mechanism, fornitore extra-UE)', 'false', true),
('ordini', 'prezzo_cbam_kg', 'NUMERIC(14,6)',
 'Tariffa CBAM in €/kg per l''intero ordine, applicata a ogni riga quando cbam = true', '0.050000', false),
('ordini_righe', 'prezzo_cbam_kg', 'NUMERIC(14,6)',
 'Tariffa CBAM €/kg ereditata dall''ordine al momento del salvataggio della riga, sommata al prezzo materiale', '0.050000', false);

COMMIT;

-- =============================================================================
-- 027 — ORDINI: "Coperto" — sconto ulteriore trasversale a tutte le chiamate
--
-- Come il CBAM (020_ordini_cbam.sql): un flag di testata ordine attiva un
-- correttivo €/kg unico per l'intero ordine, impostato una volta in testata
-- ed ereditato da ogni riga (chiamata) al momento del salvataggio, sommandosi
-- al prezzo materiale come zincatura/CBAM. A differenza del CBAM il valore è
-- tipicamente negativo (sconto aggiuntivo negoziato) e non ha una tab di
-- monitoraggio dedicata in dashboard.
-- =============================================================================

BEGIN;

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS coperto BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sconto_coperto_kg NUMERIC(14,6);

ALTER TABLE ordini_righe
    ADD COLUMN IF NOT EXISTS sconto_coperto_kg NUMERIC(14,6);

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('ordini', 'coperto', 'BOOLEAN',
 'Ordine soggetto a sconto "coperto": sconto ulteriore €/kg trasversale a tutte le chiamate', 'false', true),
('ordini', 'sconto_coperto_kg', 'NUMERIC(14,6)',
 'Sconto "coperto" in €/kg (tipicamente negativo) per l''intero ordine, applicato a ogni riga quando coperto = true', '-0.030000', false),
('ordini_righe', 'sconto_coperto_kg', 'NUMERIC(14,6)',
 'Sconto "coperto" €/kg ereditato dall''ordine al momento del salvataggio della riga, sommato al prezzo materiale', '-0.030000', false);

COMMIT;

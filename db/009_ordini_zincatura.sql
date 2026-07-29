-- =============================================================================
-- 009 — ORDINI: zincatura in conto lavoro (colonne usate dal backend
-- ma mai aggiunte da una migration committata)
-- =============================================================================

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS zincatura BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS id_zincheria INTEGER REFERENCES fornitori(id);

ALTER TABLE ordini_righe
    ADD COLUMN IF NOT EXISTS tolleranza_chiusura_kg NUMERIC(16,4) NOT NULL DEFAULT 250.00,
    ADD COLUMN IF NOT EXISTS qualita_acciaio VARCHAR(50),
    ADD COLUMN IF NOT EXISTS lunghezza_mm NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS id_listino_zincatura INTEGER REFERENCES listino_servizi(id),
    ADD COLUMN IF NOT EXISTS prezzo_zincatura NUMERIC(14,6);

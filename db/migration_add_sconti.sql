-- Add 3 additional discount columns to ordini_righe
ALTER TABLE ordini_righe
  ADD COLUMN sconto_2_percentuale NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN sconto_3_percentuale NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN sconto_4_percentuale NUMERIC(7,4) NOT NULL DEFAULT 0;

-- Convert sconto_percentuale to signed convention:
-- Old formula: importo = qty * price * (1 - sconto/100)  positive=discount
-- New formula: importo = qty * price * (1 + sconto/100)  negative=discount, positive=surcharge
-- Migration: negate all stored values (result is identical)
UPDATE ordini_righe SET sconto_percentuale = -sconto_percentuale;

-- Verify importo_riga stays correct with new formula
UPDATE ordini_righe SET importo_riga = ROUND(
  quantita_ordinata * prezzo_unitario
  * (1 + sconto_percentuale     / 100)
  * (1 + sconto_2_percentuale   / 100)
  * (1 + sconto_3_percentuale   / 100)
  * (1 + sconto_4_percentuale   / 100),
  2
);

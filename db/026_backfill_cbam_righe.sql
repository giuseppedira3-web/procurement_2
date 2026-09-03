-- =============================================================================
-- 026 — ORDINI_RIGHE: backfill prezzo_cbam_kg sulle righe esistenti
--
-- La 020 ha aggiunto ordini_righe.prezzo_cbam_kg, ma il valore viene
-- ereditato dalla testata ordine solo al momento del salvataggio della
-- singola riga (frontend). Le righe create/salvate prima di attivare CBAM
-- sull'ordine sono rimaste con prezzo_cbam_kg NULL, quindi non compaiono
-- nel costo di riga né nella dashboard CBAM. Questa migrazione recupera
-- quei dati e ricalcola l'importo_riga coerentemente con _calcola_importo
-- (backend/routers/ordini.py).
-- =============================================================================

BEGIN;

UPDATE ordini_righe r
SET prezzo_cbam_kg = o.prezzo_cbam_kg
FROM ordini o
WHERE r.id_ordine = o.id
  AND o.cbam = true
  AND o.prezzo_cbam_kg IS NOT NULL
  AND r.prezzo_cbam_kg IS NULL;

UPDATE ordini_righe r
SET importo_riga = ROUND(
    r.quantita_ordinata * r.prezzo_unitario
      * (1 + COALESCE(r.sconto_percentuale,0)/100)
      * (1 + COALESCE(r.sconto_2_percentuale,0)/100)
      * (1 + COALESCE(r.sconto_3_percentuale,0)/100)
      * (1 + COALESCE(r.sconto_4_percentuale,0)/100)
    + r.quantita_ordinata * COALESCE(r.prezzo_zincatura,0)
    + r.quantita_ordinata * COALESCE(r.prezzo_cbam_kg,0)
, 2)
FROM ordini o
WHERE r.id_ordine = o.id AND o.cbam = true;

COMMIT;

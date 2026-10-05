-- =============================================================================
-- 035 — RIGHE ORDINE TUBOLARE esistenti: extra = 0
--
-- La 034 ha lasciato prezzo_extra NULL sulle righe già presenti, ma il
-- backend rifiuta qualsiasi modifica (anche il solo cambio stato) di una riga
-- TUBOLARE senza extra ("Extra obbligatorio per i prodotti TUBOLARE"). Le
-- righe precedenti alla scomposizione base/extra hanno extra 0, come i
-- listini vecchi: l'importo non cambia (era già COALESCE(prezzo_extra, 0)).
-- Idempotente: tocca solo le righe ancora NULL.
-- =============================================================================

BEGIN;

UPDATE ordini_righe r
   SET prezzo_extra = 0
  FROM prodotti p
  JOIN categorie_prodotto cp ON cp.id = p.id_categoria
 WHERE r.id_prodotto = p.id
   AND cp.codice = 'TUBOLARE'
   AND r.prezzo_extra IS NULL;

COMMIT;

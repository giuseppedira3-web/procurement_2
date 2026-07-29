-- =============================================================================
-- 014 — Nuova categoria prodotto "COILS" (bobine laminate a caldo)
--
-- Ogni categoria in categorie_prodotto genera automaticamente una subtab
-- nella schermata Prodotti (frontend/js/pages/prodotti.js), quindi basta
-- l'INSERT per far comparire la subtab "COILS".
-- =============================================================================

INSERT INTO categorie_prodotto (codice, descrizione, tipo_prezzo, unita_misura_base)
VALUES ('COILS', 'Coils - bobine laminate a caldo', 'listino', 'kg')
ON CONFLICT (codice) DO NOTHING;

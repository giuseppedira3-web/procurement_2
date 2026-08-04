-- =============================================================================
-- 018 — Nuova categoria prodotto "OMEGA"
--
-- Ogni categoria in categorie_prodotto genera automaticamente una subtab
-- nella schermata Prodotti (frontend/js/pages/prodotti.js), quindi basta
-- l'INSERT per far comparire la subtab "OMEGA".
-- =============================================================================

INSERT INTO categorie_prodotto (codice, descrizione, tipo_prezzo, unita_misura_base)
VALUES ('OMEGA', 'Omega', 'listino', 'kg')
ON CONFLICT (codice) DO NOTHING;

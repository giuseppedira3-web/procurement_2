-- Pulizia primo import di prova: elimina i prodotti caricati senza categoria
-- e introduce una categoria reale "ALTRO" come contenitore per i prodotti
-- che non rientrano nelle 4 categorie merceologiche principali.

DELETE FROM prodotti WHERE id_categoria IS NULL;

INSERT INTO categorie_prodotto (codice, descrizione, tipo_prezzo, unita_misura_base)
VALUES ('ALTRO', 'Prodotti non riconducibili alle categorie merceologiche principali', 'listino', 'kg')
ON CONFLICT (codice) DO NOTHING;

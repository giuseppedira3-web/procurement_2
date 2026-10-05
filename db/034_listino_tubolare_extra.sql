-- =============================================================================
-- 034 — LISTINI TUBOLARE: scomposizione base + extra
--
-- Dai nuovi listini ogni profilo ha una base (soggetta a sconto) e un extra
-- (non scontato): prezzo netto = base × (1 + sconto/100) + extra.
-- La colonna prezzo esistente diventa la base; l'extra vale 0 per tutte le
-- righe già presenti, così sui listini vecchi il risultato non cambia
-- (base × sconto + 0 = prezzo × sconto, come prima). Sulla riga ordine
-- l'extra diventa un campo a sé (prezzo_extra), non scontato.
-- =============================================================================

BEGIN;

ALTER TABLE listino_tubolare_prezzi
    ADD COLUMN IF NOT EXISTS extra NUMERIC(14,6) NOT NULL DEFAULT 0;

UPDATE _dizionario_dati
   SET descrizione = 'Base di listino in €/unita_misura_acquisto del prodotto, soggetta allo sconto di categoria'
 WHERE table_name = 'listino_tubolare_prezzi' AND column_name = 'prezzo';

-- Riga ordine: l'extra va sommato dopo gli sconti, come zincatura/CBAM.
-- Obbligatorio (lato applicazione) solo per i prodotti TUBOLARE; le righe
-- esistenti restano NULL = nessun extra, importo invariato.
ALTER TABLE ordini_righe
    ADD COLUMN IF NOT EXISTS prezzo_extra NUMERIC(14,6);

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_tubolare_prezzi', 'extra', 'NUMERIC(14,6)', 'Extra in €/unita_misura_acquisto del prodotto, sommato alla base scontata (non soggetto a sconto). 0 per i listini precedenti alla scomposizione base/extra', '0.150000', true),
('ordini_righe', 'prezzo_extra', 'NUMERIC(14,6)', 'Extra di listino TUBOLARE per unità di misura della riga, sommato al prezzo dopo gli sconti (non scontato). Obbligatorio per i prodotti TUBOLARE', '0.150000', false);

COMMIT;

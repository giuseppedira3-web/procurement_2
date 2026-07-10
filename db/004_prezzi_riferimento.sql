-- =============================================================================
-- 004 — PREZZI DI RIFERIMENTO PRODOTTI (listino madre / extra) e parametri
--        di categoria (sconto / base), senza distinzione per fornitore
-- =============================================================================

-- -----------------------------------------------------------------------------
-- prodotti.prezzo_riferimento — valore comune a tutti i fornitori
--   TUBOLARE:            prezzo di listino nazionale (€ per unita_misura_acquisto, es. €/m)
--   MERCANTILE / TRAVI:  extra di lavorazione (€/kg), invariato da anni
-- -----------------------------------------------------------------------------
ALTER TABLE prodotti
    ADD COLUMN prezzo_riferimento NUMERIC(14,6);

-- -----------------------------------------------------------------------------
-- categorie_prodotto.parametro_prezzo — valore unico di categoria, persistito
--   TUBOLARE:            sconto percentuale sul listino (es. -20 = -20%)
--   MERCANTILE / TRAVI:  base corrente di mercato (€/kg), si somma all'extra
-- -----------------------------------------------------------------------------
ALTER TABLE categorie_prodotto
    ADD COLUMN parametro_prezzo NUMERIC(14,6);


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('prodotti', 'prezzo_riferimento', 'NUMERIC(14,6)',
 'Prezzo di riferimento del prodotto, comune a tutti i fornitori (nessuna distinzione per fornitore). Per TUBOLARE è il prezzo di listino nazionale (€ per unita_misura_acquisto, es. €/m); per MERCANTILE/TRAVI è l''extra di lavorazione (€/kg), stabile da anni',
 '4.490000', false),
('categorie_prodotto', 'parametro_prezzo', 'NUMERIC(14,6)',
 'Parametro di prezzo a livello di intera categoria, persistito e modificabile dall''utente. Per TUBOLARE è lo sconto percentuale applicato al listino (es. -20 = -20%); per MERCANTILE/TRAVI è la base corrente di mercato (€/kg) che si somma all''extra di ogni prodotto',
 '-20.000000', false);


-- -----------------------------------------------------------------------------
-- Seed di esempio
-- -----------------------------------------------------------------------------

-- TUBOLARE: Tubo Quadro 40x40x3, listino 4,49 €/m
INSERT INTO prodotti (codice_prodotto, descrizione, id_categoria, unita_misura_acquisto, prezzo_riferimento)
SELECT 'Q403', 'Tubo Quadro 40x40x3', id, 'm', 4.49 FROM categorie_prodotto WHERE codice = 'TUBOLARE'
ON CONFLICT (codice_prodotto) DO NOTHING;

-- Peso lineare: 3,49 kg/m
INSERT INTO conversioni_peso (id_prodotto, da_unita, a_unita, fattore_conversione, descrizione)
SELECT id, 'm', 'kg', 3.49, 'Peso lineare Tubo Quadro 40x40x3' FROM prodotti WHERE codice_prodotto = 'Q403';

-- TRAVI: HEA 100, extra 350 €/kg
INSERT INTO prodotti (codice_prodotto, descrizione, id_categoria, unita_misura_acquisto, prezzo_riferimento)
SELECT 'HEA100', 'HEA 100', id, 'kg', 350 FROM categorie_prodotto WHERE codice = 'TRAVI'
ON CONFLICT (codice_prodotto) DO NOTHING;

-- MERCANTILE: Ferro Quadro 12, extra 275 €/kg
INSERT INTO prodotti (codice_prodotto, descrizione, id_categoria, unita_misura_acquisto, prezzo_riferimento)
SELECT 'FQ12', 'Ferro Quadro 12', id, 'kg', 275 FROM categorie_prodotto WHERE codice = 'MERCANTILE'
ON CONFLICT (codice_prodotto) DO NOTHING;

-- Parametri di categoria: sconto tubolare -20%, base mercantile/travi 400 €/kg
UPDATE categorie_prodotto SET parametro_prezzo = -20  WHERE codice = 'TUBOLARE';
UPDATE categorie_prodotto SET parametro_prezzo = 400  WHERE codice = 'TRAVI';
UPDATE categorie_prodotto SET parametro_prezzo = 400  WHERE codice = 'MERCANTILE';

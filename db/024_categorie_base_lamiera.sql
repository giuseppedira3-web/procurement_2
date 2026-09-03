-- =============================================================================
-- 024 — CATEGORIE_PRODOTTO: 3 basi di prezzo LAMIERA (Nera/Decapata/Zincata)
--
-- Come base_cat_0..5 per TRAVI: valore corrente di mercato (€/ton), persistito
-- e modificabile dall'utente. Si applica solo ai prodotti LAMIERA che hanno
-- una tipologia impostata (prodotti.tipologia_lamiera) — senza tipologia non
-- si sa quale delle 3 basi usare, quindi il prodotto resta fuori dal calcolo.
-- =============================================================================

ALTER TABLE categorie_prodotto
    ADD COLUMN IF NOT EXISTS base_nera     NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS base_decapata NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS base_zincata  NUMERIC(14,6);

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('categorie_prodotto', 'base_nera',     'NUMERIC(14,6)', 'Base di mercato corrente (€/ton) per lamiera Nera. Rilevante solo per la categoria LAMIERA', '650.000000', false),
('categorie_prodotto', 'base_decapata', 'NUMERIC(14,6)', 'Base di mercato corrente (€/ton) per lamiera Decapata. Rilevante solo per la categoria LAMIERA', '700.000000', false),
('categorie_prodotto', 'base_zincata',  'NUMERIC(14,6)', 'Base di mercato corrente (€/ton) per lamiera Zincata. Rilevante solo per la categoria LAMIERA', '850.000000', false);

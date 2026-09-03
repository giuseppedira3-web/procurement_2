-- =============================================================================
-- 025 — CATEGORIE_PRODOTTO: extra larghezza LAMIERA (2 larghezze × 3 tipologie)
--
-- Le larghezze standard sono 1000/1250/1500/2000mm; solo 1000 e 2000 (le non
-- standard) hanno un sovrapprezzo, distinto per tipologia come le basi.
-- 1250/1500 restano senza extra (implicitamente zero).
-- =============================================================================

ALTER TABLE categorie_prodotto
    ADD COLUMN IF NOT EXISTS extra_l1000_nera     NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS extra_l1000_decapata NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS extra_l1000_zincata  NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS extra_l2000_nera     NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS extra_l2000_decapata NUMERIC(14,6),
    ADD COLUMN IF NOT EXISTS extra_l2000_zincata  NUMERIC(14,6);

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('categorie_prodotto', 'extra_l1000_nera',     'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Nera larghezza 1000mm (non standard)', '15.000000', false),
('categorie_prodotto', 'extra_l1000_decapata', 'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Decapata larghezza 1000mm (non standard)', '15.000000', false),
('categorie_prodotto', 'extra_l1000_zincata',  'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Zincata larghezza 1000mm (non standard)', '15.000000', false),
('categorie_prodotto', 'extra_l2000_nera',     'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Nera larghezza 2000mm (non standard)', '20.000000', false),
('categorie_prodotto', 'extra_l2000_decapata', 'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Decapata larghezza 2000mm (non standard)', '20.000000', false),
('categorie_prodotto', 'extra_l2000_zincata',  'NUMERIC(14,6)', 'Extra (€/ton) per lamiera Zincata larghezza 2000mm (non standard)', '20.000000', false);

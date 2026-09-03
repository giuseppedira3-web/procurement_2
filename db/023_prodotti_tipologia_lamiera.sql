-- =============================================================================
-- 023 — PRODOTTI: tipologia lamiera (Nera / Decapata / Zincata)
--
-- Base per la logica di prezzo LAMIERA: 3 prezzi base (uno per tipologia) più
-- extra per caratteristiche del prodotto. spessore_mm esiste già (generico a
-- tutte le categorie); qui aggiungiamo solo la tipologia, specifica di LAMIERA.
-- =============================================================================

ALTER TABLE prodotti
    ADD COLUMN IF NOT EXISTS tipologia_lamiera VARCHAR(10)
        CHECK (tipologia_lamiera IN ('Nera', 'Decapata', 'Zincata'));

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('prodotti', 'tipologia_lamiera', 'VARCHAR(10)',
 'Tipologia di lamiera (determina il prezzo base): Nera, Decapata o Zincata. Rilevante solo per la categoria LAMIERA', 'Zincata', false);

-- =============================================================================
-- 033 — LISTINO LAMIERA: qualità "attiva" per produttore/tipologia
--
-- Lo spessore è incorporato nel codice prodotto (es. "L20" = 2mm), quindi
-- l'extra spessore si applica al codice specifico via anagrafica prodotti.
-- La qualità invece NON è nel codice prodotto: non essendo deducibile dal
-- codice, l'utente seleziona una qualità tra quelle definite e quell'unica
-- riga (extra incluso) è quella "in uso" per tutti i codici Nera di quel
-- produttore — da qui la colonna selezionata, mutuamente esclusiva entro
-- (id_produttore, tipologia) via indice unico parziale.
-- =============================================================================

BEGIN;

ALTER TABLE listino_lamiera_extra_qualita
    ADD COLUMN IF NOT EXISTS selezionata BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_listino_lamiera_extra_qualita_selezionata
    ON listino_lamiera_extra_qualita (id_produttore, tipologia)
    WHERE selezionata;

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_lamiera_extra_qualita', 'selezionata', 'BOOLEAN', 'Qualità attualmente in uso per questo produttore/tipologia: al massimo una per (id_produttore, tipologia), applicata a tutti i codici lamiera di quella tipologia (la qualità non è deducibile dal codice prodotto)', 'true', true);

COMMIT;

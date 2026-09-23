-- =============================================================================
-- 030 — LISTINO LAMIERA per produttore (Arvedi / Marcegaglia / ArcelorMittal)
--
-- I 3 principali produttori di lamiera (Arvedi, Marcegaglia, ArcelorMittal)
-- hanno logiche di costo proprie (si veda 031 per gli extra a fascia di
-- spessore). Qui solo le basi comuni a tutti: Nero e Zincato — il Decapato
-- non è una base propria ma Nero + extra_decapato a fascia di spessore
-- (031), quindi non ha una colonna qui.
-- =============================================================================

BEGIN;

CREATE TABLE listino_lamiera_produttori (
    id           SERIAL          PRIMARY KEY,
    produttore   VARCHAR(30)     NOT NULL UNIQUE CHECK (produttore IN ('Arvedi', 'Marcegaglia', 'ArcelorMittal')),
    base_nera    NUMERIC(14,6),
    base_zincata NUMERIC(14,6),
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_listino_lamiera_produttori_updated_at
    BEFORE UPDATE ON listino_lamiera_produttori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO listino_lamiera_produttori (produttore) VALUES
    ('Arvedi'), ('Marcegaglia'), ('ArcelorMittal');


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('listino_lamiera_produttori', NULL, 'Basi di prezzo LAMIERA (Nero/Zincato), una riga per produttore', 'Riga fissa per produttore: nessuna creazione/cancellazione da UI, solo modifica dei valori. Il Decapato non ha base propria: vedi listino_lamiera_extra_spessore');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_lamiera_produttori', 'produttore',   'VARCHAR(30)',   'Produttore/acciaieria: Arvedi, Marcegaglia o ArcelorMittal', 'Arvedi', true),
('listino_lamiera_produttori', 'base_nera',    'NUMERIC(14,6)', 'Base di mercato corrente (€/ton) per lamiera Nera di questo produttore', '650.000000', false),
('listino_lamiera_produttori', 'base_zincata', 'NUMERIC(14,6)', 'Base di mercato corrente (€/ton) per lamiera Zincata di questo produttore', '850.000000', false);


GRANT ALL ON listino_lamiera_produttori TO procurement_user;
GRANT ALL ON listino_lamiera_produttori_id_seq TO procurement_user;

COMMIT;

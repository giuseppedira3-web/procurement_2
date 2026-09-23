-- =============================================================================
-- 031 — LISTINO LAMIERA: extra per fascia di spessore, per produttore e
-- tipologia (Nera/Zincata)
--
-- Arvedi applica un extra in funzione dello spessore lamiera, con fasce
-- distinte tra Nera e Zincata (e per la Zincata anche in funzione dello
-- spessore zinco, non ancora modellato qui). Per la Nera, la stessa fascia
-- porta anche l'extra da sommare alla Base Nero per ottenere il prezzo
-- Decapato: Decapato = Base Nero + extra_decapato della fascia.
--
-- spessore_label è testo (non numerico) perché alcune fasce accorpano più
-- spessori (es. "4-5-6"): l'ordine di visualizzazione è quindi esplicito
-- nella colonna ordine, non deducibile ordinando spessore_label.
-- =============================================================================

BEGIN;

CREATE TABLE listino_lamiera_extra_spessore (
    id              SERIAL          PRIMARY KEY,
    id_produttore   INTEGER         NOT NULL REFERENCES listino_lamiera_produttori(id) ON DELETE CASCADE,
    tipologia       VARCHAR(10)     NOT NULL CHECK (tipologia IN ('Nera', 'Zincata')),
    spessore_label  VARCHAR(20)     NOT NULL,
    ordine          SMALLINT        NOT NULL,
    extra_spessore  NUMERIC(14,6),
    extra_decapato  NUMERIC(14,6),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_produttore, tipologia, spessore_label)
);

CREATE INDEX idx_listino_lamiera_extra_spessore_produttore ON listino_lamiera_extra_spessore (id_produttore);

CREATE TRIGGER trg_listino_lamiera_extra_spessore_updated_at
    BEFORE UPDATE ON listino_lamiera_extra_spessore
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- Seed: fasce di spessore Nera per Arvedi (Zincata verrà aggiunta quando
-- saranno note le sue fasce, diverse da quelle della Nera)
-- -----------------------------------------------------------------------------
INSERT INTO listino_lamiera_extra_spessore (id_produttore, tipologia, spessore_label, ordine)
SELECT p.id, 'Nera', v.label, v.ordine
FROM listino_lamiera_produttori p
CROSS JOIN (VALUES
    ('1.5', 1), ('2', 2), ('2.5', 3), ('3', 4), ('4-5-6', 5), ('8', 6), ('10', 7), ('12', 8)
) AS v(label, ordine)
WHERE p.produttore = 'Arvedi';


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('listino_lamiera_extra_spessore', NULL, 'Extra di prezzo LAMIERA per fascia di spessore, per produttore e tipologia (Nera/Zincata)', 'Per la tipologia Nera, extra_decapato è l''extra da sommare alla Base Nero per ottenere il prezzo Decapato della stessa fascia; per la Zincata resta inutilizzato');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_lamiera_extra_spessore', 'tipologia',      'VARCHAR(10)',   'Nera o Zincata: le fasce di spessore sono distinte tra le due', 'Nera', true),
('listino_lamiera_extra_spessore', 'spessore_label', 'VARCHAR(20)',   'Fascia di spessore in mm: valore singolo o range accorpato (es. "4-5-6")', '4-5-6', true),
('listino_lamiera_extra_spessore', 'ordine',         'SMALLINT',      'Ordine di visualizzazione della fascia', '5', true),
('listino_lamiera_extra_spessore', 'extra_spessore', 'NUMERIC(14,6)', 'Extra (€/ton) per questa fascia di spessore, sommato alla base del produttore/tipologia', '10.000000', false),
('listino_lamiera_extra_spessore', 'extra_decapato', 'NUMERIC(14,6)', 'Extra (€/ton) da sommare alla Base Nero per ottenere il prezzo Decapato in questa fascia — valorizzato solo per tipologia Nera', '25.000000', false);


GRANT ALL ON listino_lamiera_extra_spessore TO procurement_user;
GRANT ALL ON listino_lamiera_extra_spessore_id_seq TO procurement_user;

COMMIT;

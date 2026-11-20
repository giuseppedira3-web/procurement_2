-- =============================================================================
-- 038 — LISTINO LAMIERA ZINCATO: fasce di spessore, qualità e rivestimento
-- zinco per Arvedi
--
-- Prezzo Zincato = Base Zincato + extra spessore + extra qualità + extra
-- rivestimento zinco (Z100/Z140/Z200/Z275). Spessore e qualità usano le
-- tabelle esistenti (031/032) con tipologia 'Zincata'. L'extra zinco dipende
-- anche dalla fascia di spessore: tabella propria a matrice
-- (fascia di spessore Zincata × rivestimento), un valore per incrocio.
-- =============================================================================

BEGIN;

-- Fasce di spessore Zincato (Arvedi)
INSERT INTO listino_lamiera_extra_spessore (id_produttore, tipologia, spessore_label, ordine)
SELECT p.id, 'Zincata', v.label, v.ordine
FROM listino_lamiera_produttori p
CROSS JOIN (VALUES
    ('0,80 - 0,99', 1), ('1,00 - 1,24', 2), ('1,25 - 1,50', 3), ('2,00 - 2,99', 4), ('3,00 - 4,00', 5)
) AS v(label, ordine)
WHERE p.produttore = 'Arvedi'
ON CONFLICT (id_produttore, tipologia, spessore_label) DO NOTHING;

-- Qualità Zincato (Arvedi)
INSERT INTO listino_lamiera_extra_qualita (id_produttore, tipologia, qualita, ordine)
SELECT p.id, 'Zincata', v.qualita, v.ordine
FROM listino_lamiera_produttori p
CROSS JOIN (VALUES ('DX51 - S220GD', 1), ('S280GD', 2)) AS v(qualita, ordine)
WHERE p.produttore = 'Arvedi'
ON CONFLICT (id_produttore, tipologia, qualita) DO NOTHING;


-- Rivestimento zinco (solo Zincato), a matrice con la fascia di spessore
CREATE TABLE listino_lamiera_extra_zincatura (
    id               SERIAL          PRIMARY KEY,
    id_spessore      INTEGER         NOT NULL REFERENCES listino_lamiera_extra_spessore(id) ON DELETE CASCADE,
    rivestimento     VARCHAR(20)     NOT NULL,
    ordine           SMALLINT        NOT NULL,
    extra_zincatura  NUMERIC(14,6),
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_spessore, rivestimento)
);

CREATE INDEX idx_listino_lamiera_extra_zincatura_spessore ON listino_lamiera_extra_zincatura (id_spessore);

CREATE TRIGGER trg_listino_lamiera_extra_zincatura_updated_at
    BEFORE UPDATE ON listino_lamiera_extra_zincatura
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Un incrocio per ogni fascia di spessore Zincata di Arvedi × rivestimento
INSERT INTO listino_lamiera_extra_zincatura (id_spessore, rivestimento, ordine)
SELECT s.id, v.rivestimento, v.ordine
FROM listino_lamiera_extra_spessore s
JOIN listino_lamiera_produttori p ON p.id = s.id_produttore
CROSS JOIN (VALUES ('Z100', 1), ('Z140', 2), ('Z200', 3), ('Z275', 4)) AS v(rivestimento, ordine)
WHERE p.produttore = 'Arvedi' AND s.tipologia = 'Zincata';


INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('listino_lamiera_extra_zincatura', NULL, 'Extra di prezzo LAMIERA Zincata per rivestimento zinco, a matrice con la fascia di spessore Zincata', 'Sommato a Base Zincato + extra spessore + extra qualità della tipologia Zincata');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_lamiera_extra_zincatura', 'id_spessore',     'INTEGER',       'Fascia di spessore Zincata (listino_lamiera_extra_spessore.id) a cui si riferisce l''extra', '9', true),
('listino_lamiera_extra_zincatura', 'rivestimento',    'VARCHAR(20)',   'Classe di rivestimento zinco', 'Z275', true),
('listino_lamiera_extra_zincatura', 'ordine',          'SMALLINT',      'Ordine di visualizzazione (colonna della matrice)', '4', true),
('listino_lamiera_extra_zincatura', 'extra_zincatura', 'NUMERIC(14,6)', 'Extra (€/ton) per questo rivestimento zinco nella fascia di spessore', '20.000000', false);


GRANT ALL ON listino_lamiera_extra_zincatura TO procurement_user;
GRANT ALL ON listino_lamiera_extra_zincatura_id_seq TO procurement_user;

COMMIT;

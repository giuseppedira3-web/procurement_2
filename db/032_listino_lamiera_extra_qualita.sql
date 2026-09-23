-- =============================================================================
-- 032 — LISTINO LAMIERA: extra per qualità, per produttore e tipologia
-- (per ora solo Nera)
--
-- Oltre alla fascia di spessore (031), Arvedi applica un extra per qualità
-- acciaio, trasversale allo spessore (stesso valore indipendentemente dalla
-- fascia). Le qualità sono quelle già censite in qualita_acciaio; qui si
-- salva solo il nome (testo, non FK) — stesso pattern già usato altrove in
-- app per la qualità (es. ordini_righe.qualita_acciaio) per tollerare
-- rinomine senza rompere riferimenti.
-- =============================================================================

BEGIN;

CREATE TABLE listino_lamiera_extra_qualita (
    id             SERIAL          PRIMARY KEY,
    id_produttore  INTEGER         NOT NULL REFERENCES listino_lamiera_produttori(id) ON DELETE CASCADE,
    tipologia      VARCHAR(10)     NOT NULL CHECK (tipologia IN ('Nera', 'Zincata')),
    qualita        VARCHAR(30)     NOT NULL,
    ordine         SMALLINT        NOT NULL,
    extra_qualita  NUMERIC(14,6),
    created_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_produttore, tipologia, qualita)
);

CREATE INDEX idx_listino_lamiera_extra_qualita_produttore ON listino_lamiera_extra_qualita (id_produttore);

CREATE TRIGGER trg_listino_lamiera_extra_qualita_updated_at
    BEFORE UPDATE ON listino_lamiera_extra_qualita
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- Seed: qualità Nera per Arvedi
-- -----------------------------------------------------------------------------
INSERT INTO listino_lamiera_extra_qualita (id_produttore, tipologia, qualita, ordine)
SELECT p.id, 'Nera', v.qualita, v.ordine
FROM listino_lamiera_produttori p
CROSS JOIN (VALUES
    ('DD11', 1), ('S235JRH', 2), ('S275JRH', 3), ('S275J0H', 4), ('S275J2H', 5), ('S355J0H', 6), ('S355J2H', 7)
) AS v(qualita, ordine)
WHERE p.produttore = 'Arvedi';


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('listino_lamiera_extra_qualita', NULL, 'Extra di prezzo LAMIERA per qualità acciaio, per produttore e tipologia (per ora solo Nera)', 'Extra trasversale allo spessore: stesso valore per tutte le fasce di listino_lamiera_extra_spessore');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listino_lamiera_extra_qualita', 'tipologia',     'VARCHAR(10)',   'Nera o Zincata', 'Nera', true),
('listino_lamiera_extra_qualita', 'qualita',       'VARCHAR(30)',   'Nome qualità acciaio (da qualita_acciaio.nome)', 'S275J0H', true),
('listino_lamiera_extra_qualita', 'ordine',        'SMALLINT',      'Ordine di visualizzazione', '2', true),
('listino_lamiera_extra_qualita', 'extra_qualita', 'NUMERIC(14,6)', 'Extra (€/ton) per questa qualità, trasversale allo spessore', '15.000000', false);


GRANT ALL ON listino_lamiera_extra_qualita TO procurement_user;
GRANT ALL ON listino_lamiera_extra_qualita_id_seq TO procurement_user;

COMMIT;

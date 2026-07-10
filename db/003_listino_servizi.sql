-- =============================================================================
-- 003 — LISTINO SERVIZI (trasporti, zincatura, lavorazioni esterne...)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CATEGORIE_SERVIZIO — Tipologie di servizio acquistato
-- -----------------------------------------------------------------------------
CREATE TABLE categorie_servizio (
    id                  SERIAL          PRIMARY KEY,
    codice              VARCHAR(30)     NOT NULL UNIQUE,
    descrizione         VARCHAR(200)    NOT NULL,
    tipo_tariffa        VARCHAR(20)     NOT NULL CHECK (tipo_tariffa IN ('tratta', 'parametrica')),
        -- 'tratta'      = tariffa fissa per percorso origine -> destinazione (es. trasporti)
        -- 'parametrica' = tariffa per unità di misura, eventualmente a fasce su un parametro
        --                 dimensionale (es. zincatura €/kg per fascia di larghezza)
    unita_misura_prezzo VARCHAR(10)     NOT NULL,   -- 'viaggio', 'kg', ecc.
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- LISTINO_SERVIZI — Prezzi servizi per fornitore
-- -----------------------------------------------------------------------------
CREATE TABLE listino_servizi (
    id                      SERIAL          PRIMARY KEY,
    id_fornitore            INTEGER         NOT NULL REFERENCES fornitori(id),
    id_categoria_servizio   INTEGER         NOT NULL REFERENCES categorie_servizio(id),

    -- Servizi a tratta (es. trasporti): percorso di riferimento
    localita_origine        VARCHAR(100),
    localita_destinazione   VARCHAR(100),

    -- Servizi parametrici (es. zincatura): a quale categoria/fascia dimensionale si applica
    id_categoria_prodotto   INTEGER         REFERENCES categorie_prodotto(id),
    descrizione_voce        VARCHAR(200),               -- es. "Piatti larghezza fino a 50mm"
    parametro_rif           VARCHAR(30),                -- es. 'larghezza_mm', 'spessore_mm', 'diametro_mm'
    parametro_min           NUMERIC(10,3),
    parametro_max           NUMERIC(10,3),

    -- Prezzo
    prezzo_unitario         NUMERIC(14,6)   NOT NULL,
    valuta                  CHAR(3)         NOT NULL DEFAULT 'EUR',
    unita_misura_prezzo     VARCHAR(10)     NOT NULL,

    -- Validità
    data_inizio             DATE            NOT NULL,
    data_fine               DATE,                       -- NULL = ancora valido
    attivo                  BOOLEAN         NOT NULL DEFAULT true,
    note                    TEXT,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_listino_servizi_fornitore ON listino_servizi (id_fornitore, id_categoria_servizio);
CREATE INDEX idx_listino_servizi_tratta ON listino_servizi (localita_origine, localita_destinazione);

CREATE TRIGGER trg_listino_servizi_updated_at
    BEFORE UPDATE ON listino_servizi
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- Seed: categorie di servizio
-- -----------------------------------------------------------------------------
INSERT INTO categorie_servizio (codice, descrizione, tipo_tariffa, unita_misura_prezzo, note) VALUES
('TRASPORTO', 'Trasporto merci su tratte definite',           'tratta',      'viaggio', 'Tariffa fissa per percorso andata/ritorno, per trasportatore'),
('ZINCATURA', 'Zincatura a caldo per kg, a fasce dimensionali', 'parametrica', 'kg',     'Tariffa €/kg variabile per categoria prodotto e fascia dimensionale (es. larghezza)');


-- -----------------------------------------------------------------------------
-- Seed: categorie prodotto mancanti (le 4 macro-categorie principali)
-- -----------------------------------------------------------------------------
INSERT INTO categorie_prodotto (codice, descrizione, tipo_prezzo, unita_misura_base, note) VALUES
('TUBOLARE',   'Tubi e profili cavi (tondi, quadri, rettangolari)', 'listino', 'kg', NULL),
('MERCANTILE', 'Mercantili: piatti, tondi, quadri, angolari',       'listino', 'kg', NULL),
('TRAVI',      'Travi e profilati a sezione aperta (HEA/HEB/IPE/UPN)', 'listino', 'kg', NULL)
ON CONFLICT (codice) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('categorie_servizio', NULL, 'Tipologie di servizi acquistati (trasporti, zincatura, lavorazioni esterne...)', 'tipo_tariffa determina come va interpretato listino_servizi'),
('listino_servizi',    NULL, 'Prezzi dei servizi per fornitore, con validità temporale', 'Per servizi "a tratta" valorizzare origine/destinazione; per servizi "parametrici" valorizzare categoria prodotto e fascia parametro');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('categorie_servizio', 'tipo_tariffa',          'VARCHAR(20)',  'tratta = tariffa fissa per percorso; parametrica = tariffa per unità a fasce dimensionali', 'tratta', true),
('listino_servizi', 'localita_origine',         'VARCHAR(100)', 'Località di partenza (servizi a tratta, es. trasporti)',        'Belpasso', false),
('listino_servizi', 'localita_destinazione',    'VARCHAR(100)', 'Località di arrivo (servizi a tratta, es. trasporti)',          'Viterbo', false),
('listino_servizi', 'id_categoria_prodotto',    'INTEGER',      'Categoria prodotto a cui si applica il servizio (servizi parametrici)', '2', false),
('listino_servizi', 'descrizione_voce',         'VARCHAR(200)', 'Descrizione libera della voce di tariffa (servizi parametrici)', 'Piatti larghezza fino a 50mm', false),
('listino_servizi', 'parametro_rif',            'VARCHAR(30)',  'Nome del parametro dimensionale a cui si riferisce la fascia',  'larghezza_mm', false),
('listino_servizi', 'parametro_min',            'NUMERIC(10,3)','Valore minimo (escluso) della fascia del parametro',            '0', false),
('listino_servizi', 'parametro_max',            'NUMERIC(10,3)','Valore massimo (incluso) della fascia del parametro',           '50', false),
('listino_servizi', 'prezzo_unitario',          'NUMERIC(14,6)','Prezzo per unità di misura indicata in unita_misura_prezzo',    '2100.00', true);


GRANT ALL ON categorie_servizio, listino_servizi TO procurement_user;
GRANT ALL ON categorie_servizio_id_seq, listino_servizi_id_seq TO procurement_user;

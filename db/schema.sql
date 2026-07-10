-- =============================================================================
-- PROCUREMENT ACCIAIO — Schema PostgreSQL 17
-- =============================================================================

-- Database e utente vanno creati prima di eseguire questo file:
--   CREATE DATABASE procurement_db ENCODING 'UTF8';
--   CREATE USER procurement_user WITH PASSWORD 'changeme';
--   GRANT ALL PRIVILEGES ON DATABASE procurement_db TO procurement_user;
--   \c procurement_db
--   GRANT ALL ON SCHEMA public TO procurement_user;

-- =============================================================================
-- FUNZIONE HELPER: aggiornamento automatico updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. FORNITORI — Anagrafica fornitori
-- =============================================================================

CREATE TABLE fornitori (
    id                      SERIAL          PRIMARY KEY,
    codice_fornitore        VARCHAR(20)     NOT NULL UNIQUE,
    ragione_sociale         VARCHAR(200)    NOT NULL,
    partita_iva             VARCHAR(20)     UNIQUE,
    codice_fiscale          VARCHAR(20),
    indirizzo               VARCHAR(200),
    cap                     VARCHAR(10),
    citta                   VARCHAR(100),
    provincia               CHAR(2),
    paese                   VARCHAR(50)     NOT NULL DEFAULT 'IT',
    telefono                VARCHAR(50),
    email                   VARCHAR(150),
    pec                     VARCHAR(150),
    iban                    VARCHAR(34),
    condizioni_pagamento    VARCHAR(100),   -- es. '30gg FM', '60gg DF'
    valuta                  CHAR(3)         NOT NULL DEFAULT 'EUR',
    attivo                  BOOLEAN         NOT NULL DEFAULT true,
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_fornitori_updated_at
    BEFORE UPDATE ON fornitori
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2. CATEGORIE_PRODOTTO — Categorie merceologiche acciaio
-- =============================================================================

CREATE TABLE categorie_prodotto (
    id                  SERIAL          PRIMARY KEY,
    codice              VARCHAR(30)     NOT NULL UNIQUE,
    descrizione         VARCHAR(200)    NOT NULL,
    tipo_prezzo         VARCHAR(10)     NOT NULL CHECK (tipo_prezzo IN ('listino', 'fisso')),
    unita_misura_base   VARCHAR(10)     NOT NULL CHECK (unita_misura_base IN ('kg', 't', 'm', 'ml', 'pz', 'mq')),
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);


-- =============================================================================
-- 3. PRODOTTI — Catalogo prodotti acciaio
-- =============================================================================

CREATE TABLE prodotti (
    id                      SERIAL          PRIMARY KEY,
    codice_prodotto         VARCHAR(50)     NOT NULL UNIQUE,
    descrizione             VARCHAR(300)    NOT NULL,
    id_categoria            INTEGER         REFERENCES categorie_prodotto(id),
    -- Attributi geometrici acciaio
    spessore_mm             NUMERIC(10,3),
    larghezza_mm            NUMERIC(10,3),
    lunghezza_mm            NUMERIC(10,3),  -- lunghezza barra/lastra standard
    diametro_mm             NUMERIC(10,3),  -- per tubi, barre tonde, vergella
    -- Normativa e qualità
    norma                   VARCHAR(50),    -- es. 'EN 10025', 'EN 10210', 'EN 10219'
    qualita_acciaio         VARCHAR(50),    -- es. 'S235JR', 'S355JR', 'S275JR', 'S420MH'
    -- Unità e peso
    unita_misura_acquisto   VARCHAR(10)     NOT NULL,   -- 'kg', 't', 'm', 'pz'
    peso_unitario_kg        NUMERIC(14,6),              -- kg per unità di acquisto
    -- Stato
    attivo                  BOOLEAN         NOT NULL DEFAULT true,
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_prodotti_updated_at
    BEFORE UPDATE ON prodotti
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 4. CONVERSIONI_PESO — Fattori di conversione verso kg
-- =============================================================================

CREATE TABLE conversioni_peso (
    id                      SERIAL          PRIMARY KEY,
    id_prodotto             INTEGER         REFERENCES prodotti(id),
    id_categoria            INTEGER         REFERENCES categorie_prodotto(id),
    da_unita                VARCHAR(10)     NOT NULL,   -- 'pz', 'm', 'mq', 'ml'
    a_unita                 VARCHAR(10)     NOT NULL DEFAULT 'kg',
    fattore_conversione     NUMERIC(16,8)   NOT NULL,   -- es. 16.7 (1m HEA100 = 16.7 kg)
    lunghezza_riferimento_mm NUMERIC(10,2),             -- lunghezza barra di riferimento
    descrizione             VARCHAR(200),
    valido_da               DATE,
    valido_a                DATE,                       -- NULL = ancora valido
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT chk_conv_prodotto_o_categoria
        CHECK (id_prodotto IS NOT NULL OR id_categoria IS NOT NULL)
);

CREATE INDEX idx_conv_prodotto ON conversioni_peso (id_prodotto);
CREATE INDEX idx_conv_categoria ON conversioni_peso (id_categoria);


-- =============================================================================
-- 5. LISTINO_PREZZI — Prezzi per fornitore
-- =============================================================================

CREATE TABLE listino_prezzi (
    id                  SERIAL          PRIMARY KEY,
    id_fornitore        INTEGER         NOT NULL REFERENCES fornitori(id),
    id_prodotto         INTEGER         REFERENCES prodotti(id),
    id_categoria        INTEGER         REFERENCES categorie_prodotto(id),
    tipo                VARCHAR(10)     NOT NULL CHECK (tipo IN ('listino', 'fisso')),
    prezzo_unitario     NUMERIC(14,6)   NOT NULL,
    valuta              CHAR(3)         NOT NULL DEFAULT 'EUR',
    unita_misura_prezzo VARCHAR(10)     NOT NULL,   -- 'kg', 't', 'm', 'pz'
    data_inizio         DATE            NOT NULL,
    data_fine           DATE,                       -- NULL = ancora valido
    attivo              BOOLEAN         NOT NULL DEFAULT true,
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CONSTRAINT chk_listino_prodotto_o_categoria
        CHECK (id_prodotto IS NOT NULL OR id_categoria IS NOT NULL)
);

CREATE INDEX idx_listino_fornitore_prodotto ON listino_prezzi (id_fornitore, id_prodotto, data_inizio);
CREATE INDEX idx_listino_fornitore_categoria ON listino_prezzi (id_fornitore, id_categoria, data_inizio);

CREATE TRIGGER trg_listino_updated_at
    BEFORE UPDATE ON listino_prezzi
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 6. ORDINI — Testata Ordini di Acquisto
-- =============================================================================

CREATE TABLE ordini (
    id                      SERIAL          PRIMARY KEY,
    codice_ordine           VARCHAR(50)     NOT NULL UNIQUE,
    id_fornitore            INTEGER         NOT NULL REFERENCES fornitori(id),
    numero_progressivo      INTEGER         NOT NULL,
    anno                    SMALLINT        NOT NULL,
    riferimento_fornitore   VARCHAR(100),               -- eventuale codice del fornitore
    data_ordine             DATE            NOT NULL,
    data_consegna_prevista  DATE,
    luogo_consegna          TEXT,
    incoterm                VARCHAR(10),                -- EXW, DAP, DDP, FCA...
    valuta                  CHAR(3)         NOT NULL DEFAULT 'EUR',
    stato                   VARCHAR(30)     NOT NULL DEFAULT 'bozza'
        CHECK (stato IN ('bozza','inviato','confermato','parzialmente_consegnato','completato','annullato')),
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_fornitore, anno, numero_progressivo)
);

CREATE INDEX idx_ordini_fornitore ON ordini (id_fornitore);
CREATE INDEX idx_ordini_stato ON ordini (stato);
CREATE INDEX idx_ordini_codice ON ordini (codice_ordine);

CREATE TRIGGER trg_ordini_updated_at
    BEFORE UPDATE ON ordini
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 7. ORDINI_RIGHE — Righe Ordine
-- =============================================================================

CREATE TABLE ordini_righe (
    id                      SERIAL          PRIMARY KEY,
    id_ordine               INTEGER         NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
    numero_riga             SMALLINT        NOT NULL,
    id_prodotto             INTEGER         REFERENCES prodotti(id),
    descrizione_libera      TEXT,
    quantita_ordinata       NUMERIC(16,4)   NOT NULL,
    unita_misura            VARCHAR(10)     NOT NULL,
    quantita_kg             NUMERIC(16,4),              -- convertito tramite conversioni_peso
    prezzo_unitario         NUMERIC(14,6)   NOT NULL,
    valuta                  CHAR(3)         NOT NULL DEFAULT 'EUR',
    sconto_percentuale      NUMERIC(7,4)    NOT NULL DEFAULT 0,
    importo_riga            NUMERIC(16,2)   NOT NULL,
    quantita_consegnata     NUMERIC(16,4)   NOT NULL DEFAULT 0,
    quantita_fatturata      NUMERIC(16,4)   NOT NULL DEFAULT 0,
    stato_riga              VARCHAR(20)     NOT NULL DEFAULT 'aperta'
        CHECK (stato_riga IN ('aperta','parziale','completa','annullata')),
    data_consegna_prevista  DATE,
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_ordine, numero_riga),
    CONSTRAINT chk_riga_prodotto_o_desc
        CHECK (id_prodotto IS NOT NULL OR descrizione_libera IS NOT NULL)
);

CREATE INDEX idx_ordini_righe_ordine ON ordini_righe (id_ordine);
CREATE INDEX idx_ordini_righe_prodotto ON ordini_righe (id_prodotto);

CREATE TRIGGER trg_ordini_righe_updated_at
    BEFORE UPDATE ON ordini_righe
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 8. DDT — Testata Documento di Trasporto
-- =============================================================================

CREATE TABLE ddt (
    id                      SERIAL          PRIMARY KEY,
    codice_ddt              VARCHAR(50)     NOT NULL UNIQUE,
    id_fornitore            INTEGER         NOT NULL REFERENCES fornitori(id),
    numero_ddt_fornitore    VARCHAR(50)     NOT NULL,
    data_ddt                DATE            NOT NULL,
    data_ricezione          DATE,
    numero_colli            INTEGER,
    peso_lordo_kg           NUMERIC(14,4),
    peso_netto_kg           NUMERIC(14,4),
    vettore                 VARCHAR(200),
    targa                   VARCHAR(20),
    stato                   VARCHAR(20)     NOT NULL DEFAULT 'ricevuto'
        CHECK (stato IN ('ricevuto','verificato','fatturato','contestato')),
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_fornitore, numero_ddt_fornitore)
);

CREATE INDEX idx_ddt_fornitore ON ddt (id_fornitore);
CREATE INDEX idx_ddt_codice ON ddt (codice_ddt);

CREATE TRIGGER trg_ddt_updated_at
    BEFORE UPDATE ON ddt
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 9. DDT_RIGHE — Righe DDT
-- =============================================================================

CREATE TABLE ddt_righe (
    id                      SERIAL          PRIMARY KEY,
    id_ddt                  INTEGER         NOT NULL REFERENCES ddt(id) ON DELETE CASCADE,
    numero_riga             SMALLINT        NOT NULL,
    id_ordine               INTEGER         REFERENCES ordini(id),
    id_riga_ordine          INTEGER         REFERENCES ordini_righe(id),
    id_prodotto             INTEGER         REFERENCES prodotti(id),
    descrizione_libera      TEXT,
    quantita_consegnata     NUMERIC(16,4)   NOT NULL,
    unita_misura            VARCHAR(10)     NOT NULL,
    quantita_kg             NUMERIC(16,4),
    lotto                   VARCHAR(100),               -- numero lotto/colata
    numero_colata           VARCHAR(100),               -- heat number per tracciabilità
    certificato_qualita     VARCHAR(100),               -- es. 'EN 10204 3.1'
    fatturato               BOOLEAN         NOT NULL DEFAULT false,
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_ddt, numero_riga)
);

CREATE INDEX idx_ddt_righe_ddt ON ddt_righe (id_ddt);
CREATE INDEX idx_ddt_righe_ordine ON ddt_righe (id_ordine);
CREATE INDEX idx_ddt_righe_riga_ordine ON ddt_righe (id_riga_ordine);
CREATE INDEX idx_ddt_righe_non_fatturate ON ddt_righe (fatturato) WHERE fatturato = false;

CREATE TRIGGER trg_ddt_righe_updated_at
    BEFORE UPDATE ON ddt_righe
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 10. FATTURE — Testata Fatture (con campi FatturaPA / SDI)
-- =============================================================================

CREATE TABLE fatture (
    id                          SERIAL          PRIMARY KEY,
    codice_fattura              VARCHAR(50)     NOT NULL UNIQUE,
    id_fornitore                INTEGER         NOT NULL REFERENCES fornitori(id),
    numero_fattura_fornitore    VARCHAR(50)     NOT NULL,
    data_fattura                DATE            NOT NULL,
    data_ricezione              DATE,
    data_scadenza               DATE,
    imponibile                  NUMERIC(16,2)   NOT NULL,
    aliquota_iva                NUMERIC(5,2)    NOT NULL DEFAULT 22.00,
    importo_iva                 NUMERIC(16,2)   NOT NULL,
    totale                      NUMERIC(16,2)   NOT NULL,
    valuta                      CHAR(3)         NOT NULL DEFAULT 'EUR',
    stato                       VARCHAR(20)     NOT NULL DEFAULT 'ricevuta'
        CHECK (stato IN ('ricevuta','in_verifica','verificata','approvata','pagata','contestata','annullata')),
    data_pagamento              DATE,
    modalita_pagamento          VARCHAR(100),
    riferimento_riba            VARCHAR(50),
    -- Campi FatturaPA / SDI
    numero_sdi                  VARCHAR(20),
    xml_sdi_path                TEXT,
    codice_destinatario         VARCHAR(7),
    tipo_documento_sdi          VARCHAR(10),    -- TD01, TD04, TD05...
    data_ricezione_sdi          DATE,
    note                        TEXT,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_fornitore, numero_fattura_fornitore)
);

CREATE INDEX idx_fatture_fornitore ON fatture (id_fornitore);
CREATE INDEX idx_fatture_codice ON fatture (codice_fattura);
CREATE INDEX idx_fatture_stato ON fatture (stato);
CREATE INDEX idx_fatture_scadenza ON fatture (data_scadenza) WHERE stato NOT IN ('pagata','annullata');

CREATE TRIGGER trg_fatture_updated_at
    BEFORE UPDATE ON fatture
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 11. FATTURE_RIGHE — Righe Fattura
-- =============================================================================

CREATE TABLE fatture_righe (
    id                  SERIAL          PRIMARY KEY,
    id_fattura          INTEGER         NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
    numero_riga         SMALLINT        NOT NULL,
    id_ddt              INTEGER         REFERENCES ddt(id),
    id_riga_ddt         INTEGER         REFERENCES ddt_righe(id),
    id_ordine           INTEGER         REFERENCES ordini(id),
    id_riga_ordine      INTEGER         REFERENCES ordini_righe(id),
    id_prodotto         INTEGER         REFERENCES prodotti(id),
    descrizione_fattura TEXT            NOT NULL,
    quantita            NUMERIC(16,4)   NOT NULL,
    unita_misura        VARCHAR(10)     NOT NULL,
    prezzo_unitario     NUMERIC(14,6)   NOT NULL,
    sconto_percentuale  NUMERIC(7,4)    NOT NULL DEFAULT 0,
    importo_riga        NUMERIC(16,2)   NOT NULL,
    aliquota_iva        NUMERIC(5,2)    NOT NULL DEFAULT 22.00,
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_fattura, numero_riga)
);

CREATE INDEX idx_fatture_righe_fattura ON fatture_righe (id_fattura);
CREATE INDEX idx_fatture_righe_ddt ON fatture_righe (id_ddt);
CREATE INDEX idx_fatture_righe_ordine ON fatture_righe (id_ordine);

CREATE TRIGGER trg_fatture_righe_updated_at
    BEFORE UPDATE ON fatture_righe
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 12. ALLEGATI — Documenti allegati (PDF, scansioni, certificati)
-- =============================================================================

CREATE TABLE allegati (
    id              SERIAL          PRIMARY KEY,
    tipo_documento  VARCHAR(20)     NOT NULL CHECK (tipo_documento IN ('ordine','ddt','fattura')),
    id_documento    INTEGER         NOT NULL,
    nome_file       VARCHAR(300)    NOT NULL,
    percorso_file   TEXT            NOT NULL,
    dimensione_bytes BIGINT,
    mime_type       VARCHAR(100),
    uploaded_at     TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_allegati_documento ON allegati (tipo_documento, id_documento);


-- =============================================================================
-- TRIGGER BUSINESS LOGIC
-- Aggiornamento quantita_consegnata su ordini_righe alla ricezione di ddt_righe
-- =============================================================================

CREATE OR REPLACE FUNCTION aggiorna_qta_consegnata()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE ordini_righe
        SET quantita_consegnata = (
            SELECT COALESCE(SUM(dr.quantita_consegnata), 0)
            FROM ddt_righe dr
            JOIN ddt d ON d.id = dr.id_ddt
            WHERE dr.id_riga_ordine = NEW.id_riga_ordine
              AND d.stato != 'contestato'
        ),
        stato_riga = CASE
            WHEN quantita_ordinata <= (
                SELECT COALESCE(SUM(dr.quantita_consegnata), 0)
                FROM ddt_righe dr JOIN ddt d ON d.id = dr.id_ddt
                WHERE dr.id_riga_ordine = NEW.id_riga_ordine AND d.stato != 'contestato'
            ) THEN 'completa'
            WHEN (
                SELECT COALESCE(SUM(dr.quantita_consegnata), 0)
                FROM ddt_righe dr JOIN ddt d ON d.id = dr.id_ddt
                WHERE dr.id_riga_ordine = NEW.id_riga_ordine AND d.stato != 'contestato'
            ) > 0 THEN 'parziale'
            ELSE stato_riga
        END
        WHERE id = NEW.id_riga_ordine;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.id_riga_ordine IS NOT NULL THEN
        UPDATE ordini_righe
        SET quantita_consegnata = (
            SELECT COALESCE(SUM(dr.quantita_consegnata), 0)
            FROM ddt_righe dr JOIN ddt d ON d.id = dr.id_ddt
            WHERE dr.id_riga_ordine = OLD.id_riga_ordine AND d.stato != 'contestato'
        )
        WHERE id = OLD.id_riga_ordine;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aggiorna_consegnato_ins_upd
    AFTER INSERT OR UPDATE ON ddt_righe
    FOR EACH ROW
    WHEN (NEW.id_riga_ordine IS NOT NULL)
    EXECUTE FUNCTION aggiorna_qta_consegnata();

CREATE TRIGGER trg_aggiorna_consegnato_del
    AFTER DELETE ON ddt_righe
    FOR EACH ROW
    WHEN (OLD.id_riga_ordine IS NOT NULL)
    EXECUTE FUNCTION aggiorna_qta_consegnata();


-- Aggiornamento quantita_fatturata su ordini_righe e flag fatturato su ddt_righe
CREATE OR REPLACE FUNCTION aggiorna_qta_fatturata()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.id_riga_ordine IS NOT NULL THEN
        UPDATE ordini_righe
        SET quantita_fatturata = (
            SELECT COALESCE(SUM(fr.quantita), 0)
            FROM fatture_righe fr
            JOIN fatture f ON f.id = fr.id_fattura
            WHERE fr.id_riga_ordine = NEW.id_riga_ordine
              AND f.stato NOT IN ('annullata','contestata')
        )
        WHERE id = NEW.id_riga_ordine;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.id_riga_ddt IS NOT NULL THEN
        UPDATE ddt_righe
        SET fatturato = true
        WHERE id = NEW.id_riga_ddt;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.id_riga_ordine IS NOT NULL THEN
            UPDATE ordini_righe
            SET quantita_fatturata = (
                SELECT COALESCE(SUM(fr.quantita), 0)
                FROM fatture_righe fr JOIN fatture f ON f.id = fr.id_fattura
                WHERE fr.id_riga_ordine = OLD.id_riga_ordine AND f.stato NOT IN ('annullata','contestata')
            )
            WHERE id = OLD.id_riga_ordine;
        END IF;
        IF OLD.id_riga_ddt IS NOT NULL THEN
            UPDATE ddt_righe
            SET fatturato = EXISTS (
                SELECT 1 FROM fatture_righe WHERE id_riga_ddt = OLD.id_riga_ddt
                  AND id != OLD.id
            )
            WHERE id = OLD.id_riga_ddt;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aggiorna_fatturato
    AFTER INSERT OR UPDATE OR DELETE ON fatture_righe
    FOR EACH ROW EXECUTE FUNCTION aggiorna_qta_fatturata();


-- =============================================================================
-- VISTE
-- =============================================================================

-- Stato avanzamento ordini
CREATE VIEW v_stato_ordini AS
SELECT
    o.codice_ordine,
    f.ragione_sociale                                   AS fornitore,
    o.data_ordine,
    o.data_consegna_prevista,
    o.stato,
    COUNT(r.id)                                         AS num_righe,
    SUM(r.quantita_ordinata)                            AS qta_totale_ordinata,
    SUM(r.quantita_consegnata)                          AS qta_totale_consegnata,
    SUM(r.quantita_fatturata)                           AS qta_totale_fatturata,
    SUM(r.importo_riga)                                 AS valore_ordinato,
    ROUND(100.0 * SUM(r.quantita_consegnata)
        / NULLIF(SUM(r.quantita_ordinata), 0), 1)       AS perc_consegnato,
    ROUND(100.0 * SUM(r.quantita_fatturata)
        / NULLIF(SUM(r.quantita_ordinata), 0), 1)       AS perc_fatturato
FROM ordini o
JOIN fornitori f ON f.id = o.id_fornitore
LEFT JOIN ordini_righe r ON r.id_ordine = o.id
GROUP BY o.id, o.codice_ordine, f.ragione_sociale,
         o.data_ordine, o.data_consegna_prevista, o.stato;


-- 3-way match: scostamenti tra prezzo ordinato e prezzo fatturato
CREATE VIEW v_scostamenti_prezzi AS
SELECT
    o.codice_ordine,
    f.ragione_sociale                                               AS fornitore,
    p.codice_prodotto,
    p.descrizione                                                   AS prodotto,
    r.prezzo_unitario                                               AS prezzo_ordinato,
    fr.prezzo_unitario                                              AS prezzo_fatturato,
    fr.prezzo_unitario - r.prezzo_unitario                          AS delta_prezzo,
    ROUND(100.0 * (fr.prezzo_unitario - r.prezzo_unitario)
        / NULLIF(r.prezzo_unitario, 0), 2)                         AS delta_perc,
    fr.quantita,
    (fr.prezzo_unitario - r.prezzo_unitario) * fr.quantita          AS delta_importo,
    ft.codice_fattura,
    ft.data_fattura
FROM fatture_righe fr
JOIN fatture ft ON ft.id = fr.id_fattura
JOIN fornitori f ON f.id = ft.id_fornitore
LEFT JOIN ordini_righe r ON r.id = fr.id_riga_ordine
LEFT JOIN ordini o ON o.id = fr.id_ordine
LEFT JOIN prodotti p ON p.id = fr.id_prodotto
WHERE fr.id_riga_ordine IS NOT NULL
  AND ft.stato NOT IN ('annullata', 'contestata');


-- DDT ricevuti non ancora completamente fatturati
CREATE VIEW v_ddt_non_fatturati AS
SELECT
    d.codice_ddt,
    f.ragione_sociale       AS fornitore,
    d.data_ddt,
    d.data_ricezione,
    d.stato,
    COUNT(dr.id)            AS righe_totali,
    COUNT(dr.id) FILTER (WHERE dr.fatturato = false) AS righe_non_fatturate
FROM ddt d
JOIN fornitori f ON f.id = d.id_fornitore
JOIN ddt_righe dr ON dr.id_ddt = d.id
WHERE d.stato != 'fatturato'
GROUP BY d.id, d.codice_ddt, f.ragione_sociale, d.data_ddt, d.data_ricezione, d.stato
HAVING COUNT(dr.id) FILTER (WHERE dr.fatturato = false) > 0;


-- Esposizione per fornitore (fatture da pagare)
CREATE VIEW v_esposizione_fornitore AS
SELECT
    f.codice_fornitore,
    f.ragione_sociale,
    ft.stato,
    ft.data_scadenza,
    CASE
        WHEN ft.data_scadenza < CURRENT_DATE THEN 'scaduta'
        WHEN ft.data_scadenza <= CURRENT_DATE + INTERVAL '7 days' THEN 'in_scadenza'
        ELSE 'futura'
    END                     AS urgenza,
    COUNT(ft.id)            AS num_fatture,
    SUM(ft.totale)          AS totale_da_pagare,
    ft.valuta
FROM fatture ft
JOIN fornitori f ON f.id = ft.id_fornitore
WHERE ft.stato NOT IN ('pagata', 'annullata')
GROUP BY f.id, f.codice_fornitore, f.ragione_sociale,
         ft.stato, ft.data_scadenza, ft.valuta
ORDER BY ft.data_scadenza;


-- =============================================================================
-- DIZIONARIO DATI — Registro consultabile delle tabelle
-- =============================================================================

CREATE TABLE _dizionario_dati (
    id              SERIAL          PRIMARY KEY,
    schema_name     VARCHAR(50)     NOT NULL DEFAULT 'public',
    table_name      VARCHAR(100)    NOT NULL,
    column_name     VARCHAR(100),               -- NULL = descrizione della tabella intera
    data_type       VARCHAR(100),
    descrizione     TEXT            NOT NULL,
    esempio         TEXT,
    obbligatorio    BOOLEAN,
    note            TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_dizionario_tabella ON _dizionario_dati (table_name, column_name);

-- Descrizioni tabelle
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('fornitori',           NULL, 'Anagrafica completa dei fornitori di materiale siderurgico', 'codice_fornitore è usato come prefisso in tutti i codici documento'),
('categorie_prodotto',  NULL, 'Categorie merceologiche acciaio (lamiere, profilati, tubi, barre...)', 'Definisce anche l''unità di misura base e il metodo di determinazione prezzi'),
('prodotti',            NULL, 'Catalogo articoli acquistati con attributi geometrici e metallurgici', 'Attributi specifici acciaio: norma EN, qualità (S235/S355...), geometria'),
('conversioni_peso',    NULL, 'Fattori di conversione da unità di misura acquisto a kg', 'Es: 1m di HEA100 = 16.7 kg. Indispensabile per uniformare tutti i materiali a peso'),
('listino_prezzi',      NULL, 'Prezzi per fornitore, prodotto o categoria, con validità temporale', 'Supporta sia prezzi di listino (variabili) che prezzi fissi da contratto'),
('ordini',              NULL, 'Testata degli ordini di acquisto emessi ai fornitori', 'Codice formato: {FORNITORE}-OA-{ANNO}-{NNNN}'),
('ordini_righe',        NULL, 'Righe di dettaglio degli ordini di acquisto', 'Traccia quantità ordinata, consegnata e fatturata per ogni posizione'),
('ddt',                 NULL, 'Testata dei Documenti di Trasporto ricevuti dai fornitori', 'Codice formato: {FORNITORE}-DDT-{ANNO}-{NNNN}'),
('ddt_righe',           NULL, 'Righe di dettaglio dei DDT con riferimento all''ordine di origine', 'Un DDT può contenere materiale da ordini diversi. Include numero colata per tracciabilità'),
('fatture',             NULL, 'Testata delle fatture passive ricevute dai fornitori', 'Campi SDI/FatturaPA per integrazione con estrazione automatica da email XML'),
('fatture_righe',       NULL, 'Righe di dettaglio fattura con collegamento a DDT e ordine', 'Permette il 3-way match: ordine ↔ DDT ↔ fattura per ogni posizione'),
('allegati',            NULL, 'Documenti allegati (PDF ordini, scansioni DDT, XML fatture)', 'FK polimorfica: tipo_documento + id_documento identifica il documento padre'),
('_dizionario_dati',    NULL, 'Registro consultabile di tutte le tabelle e colonne dello schema', 'Usato dalla web app per generare documentazione e tooltip contestuali');

-- Descrizioni colonne chiave per tabelle principali
INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
-- fornitori
('fornitori', 'codice_fornitore',       'VARCHAR(20)',   'Codice breve identificativo usato come prefisso nei codici documento',  'METAL01', true),
('fornitori', 'condizioni_pagamento',   'VARCHAR(100)',  'Termini di pagamento concordati',                                       '60gg DF', false),
('fornitori', 'pec',                    'VARCHAR(150)',  'PEC per invio ordini e comunicazioni formali',                          'admin@fornitore.pec.it', false),
-- categorie_prodotto
('categorie_prodotto', 'tipo_prezzo',   'VARCHAR(10)',   'listino = prezzo da listino aggiornabile periodicamente; fisso = prezzo negoziato a contratto', 'listino', true),
('categorie_prodotto', 'unita_misura_base', 'VARCHAR(10)', 'Unità di misura prevalente per questa categoria',                    'kg', true),
-- prodotti
('prodotti', 'norma',                   'VARCHAR(50)',   'Norma tecnica europea di riferimento',                                  'EN 10025', false),
('prodotti', 'qualita_acciaio',         'VARCHAR(50)',   'Grado/qualità dell''acciaio secondo la norma',                         'S355JR', false),
('prodotti', 'peso_unitario_kg',        'NUMERIC(14,6)', 'Peso in kg per unità di acquisto (es. kg/m per profilati)',             '16.7', false),
-- conversioni_peso
('conversioni_peso', 'fattore_conversione', 'NUMERIC(16,8)', '1 unità della colonna da_unita equivale a questo numero di kg',   '16.700000', true),
('conversioni_peso', 'lunghezza_riferimento_mm', 'NUMERIC(10,2)', 'Lunghezza barra su cui è calcolato il peso unitario',         '6000.00', false),
-- ordini
('ordini', 'codice_ordine',             'VARCHAR(50)',   'Codice univoco formato: {FORNITORE}-OA-{ANNO}-{NNNN}',                  'METAL01-OA-2026-0001', true),
('ordini', 'incoterm',                  'VARCHAR(10)',   'Resa della merce secondo Incoterms ICC',                               'DAP', false),
('ordini', 'stato',                     'VARCHAR(30)',   'Ciclo di vita: bozza→inviato→confermato→parz.consegnato→completato',   'inviato', true),
-- ordini_righe
('ordini_righe', 'quantita_kg',         'NUMERIC(16,4)', 'Quantità espressa in kg tramite conversioni_peso (aggiornata dall''app)', '1250.0000', false),
('ordini_righe', 'quantita_consegnata', 'NUMERIC(16,4)', 'Somma aggiornata automaticamente dai trigger all''inserimento di ddt_righe', '500.0000', false),
('ordini_righe', 'quantita_fatturata',  'NUMERIC(16,4)', 'Somma aggiornata automaticamente dai trigger all''inserimento di fatture_righe', '500.0000', false),
-- ddt
('ddt', 'codice_ddt',                   'VARCHAR(50)',   'Codice univoco formato: {FORNITORE}-DDT-{ANNO}-{NNNN}',                 'METAL01-DDT-2026-0042', true),
('ddt', 'numero_ddt_fornitore',         'VARCHAR(50)',   'Numero del DDT come riportato sul documento del fornitore',            '4521/2026', true),
-- ddt_righe
('ddt_righe', 'lotto',                  'VARCHAR(100)',  'Numero di lotto del materiale (tracciabilità produzione)',              'L2026-089', false),
('ddt_righe', 'numero_colata',          'VARCHAR(100)',  'Heat number/numero colata acciaio per certificati EN 10204',           'C-2026-0334', false),
('ddt_righe', 'certificato_qualita',    'VARCHAR(100)',  'Tipo certificato di qualità allegato (es. EN 10204 3.1)',               'EN 10204 3.1', false),
-- fatture
('fatture', 'numero_sdi',               'VARCHAR(20)',   'Numero progressivo assegnato dal Sistema di Interscambio (AdE)',       '000012345', false),
('fatture', 'tipo_documento_sdi',       'VARCHAR(10)',   'Tipo documento FatturaPA: TD01=fattura, TD04=nota credito, TD05=nota debito', 'TD01', false),
('fatture', 'xml_sdi_path',             'TEXT',          'Percorso file XML FatturaPA originale su filesystem',                  '/root/procurement/fatture_xml/IT01234567890_FPA12.xml', false),
-- allegati
('allegati', 'tipo_documento',          'VARCHAR(20)',   'Tipo del documento padre: ordine, ddt o fattura',                     'ddt', true),
('allegati', 'id_documento',            'INTEGER',       'ID del record padre nella tabella corrispondente a tipo_documento',    '42', true);

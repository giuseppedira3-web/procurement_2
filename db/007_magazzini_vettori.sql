-- =============================================================================
-- 007 — Magazzini fornitore + Vettori + campi su ordini
-- =============================================================================

CREATE TABLE magazzini_fornitore (
    id           SERIAL       PRIMARY KEY,
    id_fornitore INTEGER      NOT NULL REFERENCES fornitori(id) ON DELETE CASCADE,
    comune       VARCHAR(100) NOT NULL,
    indirizzo    VARCHAR(200),
    note         TEXT,
    attivo       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_magazzini_fornitore ON magazzini_fornitore(id_fornitore);

CREATE TABLE vettori (
    id              SERIAL       PRIMARY KEY,
    ragione_sociale VARCHAR(200) NOT NULL,
    telefono        VARCHAR(50),
    email           VARCHAR(150),
    note            TEXT,
    attivo          BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE ordini
    ADD COLUMN id_magazzino_origine INTEGER REFERENCES magazzini_fornitore(id),
    ADD COLUMN comune_destinazione  VARCHAR(100),
    ADD COLUMN id_vettore           INTEGER REFERENCES vettori(id);

GRANT ALL PRIVILEGES ON TABLE  magazzini_fornitore            TO procurement_user;
GRANT ALL PRIVILEGES ON TABLE  vettori                        TO procurement_user;
GRANT ALL PRIVILEGES ON SEQUENCE magazzini_fornitore_id_seq   TO procurement_user;
GRANT ALL PRIVILEGES ON SEQUENCE vettori_id_seq               TO procurement_user;

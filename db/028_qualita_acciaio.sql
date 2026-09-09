-- =============================================================================
-- 028 — QUALITA_ACCIAIO: anagrafica delle qualità/gradi acciaio
--
-- Finora l'elenco delle qualità (S235JRH, S355J2H, ...) era una lista fissa
-- solo lato frontend (QUALITA_ACCIAIO in utils.js): per aggiungerne una nuova
-- serviva modificare il codice. Con questa tabella l'elenco diventa gestibile
-- da un tab "Qualità" in Anagrafica: si può aggiungere una nuova qualità e
-- rinominare quelle esistenti (rinominare propaga il nuovo nome su prodotti e
-- ordini_righe, che referenziano la qualità per testo e non per id). Niente
-- rimozione: prodotti.qualita_acciaio e ordini_righe.qualita_acciaio restano
-- colonne di testo libero (non FK) proprio per non rompere gli storici se una
-- qualità viene tolta dall'elenco — la cancellazione va evitata a monte.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS qualita_acciaio (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(50) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO qualita_acciaio (nome) VALUES
    ('S235JRH'), ('DX51D'), ('S275JRH'), ('S275J0H'), ('S275J2H'),
    ('S355J0H'), ('S355J2H'), ('S355JOWPH - CORTEN'), ('S280GD+Z'),
    ('DD11'), ('DC01'), ('N.a.'), ('Libero')
ON CONFLICT (nome) DO NOTHING;

-- La tabella (a differenza delle colonne aggiunte a tabelle esistenti come
-- in 020_ordini_cbam.sql) è nuova: senza GRANT esplicito il ruolo applicativo
-- procurement_user non ha alcun privilegio su di essa (proprietaria resta
-- chi esegue la migrazione, tipicamente postgres).
GRANT ALL ON qualita_acciaio TO procurement_user;
GRANT ALL ON qualita_acciaio_id_seq TO procurement_user;

INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('qualita_acciaio', NULL,
 'Anagrafica delle qualità/gradi acciaio selezionabili su prodotti e righe ordine',
 'Rinominare una voce propaga il nuovo nome su prodotti.qualita_acciaio e ordini_righe.qualita_acciaio esistenti. Nessuna cancellazione ammessa dall''app.');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('qualita_acciaio', 'nome', 'VARCHAR(50)',
 'Nome della qualità acciaio (univoco)', 'S355J2H', true);

COMMIT;

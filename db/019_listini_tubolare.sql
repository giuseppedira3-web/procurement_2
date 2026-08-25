-- =============================================================================
-- 019 — LISTINI TUBOLARE — listini nazionali multipli, storicizzati
--
-- Il prezzo di listino TUBOLARE (prodotti.prezzo_riferimento / prezzo_s275j0h /
-- prezzo_s355j2h) era finora unico e implicito. Da qui in poi il prezzo per
-- qualità è agganciato a un "listino" nominato (es. "Listino 1/2026"): la
-- stessa anagrafica prodotti resta trasversale, cambia solo il prezzo per
-- listino. Nessuna validità temporale richiesta: si passa da un listino
-- all'altro esplicitamente, i vecchi restano consultabili come storico.
--
-- Riguarda SOLO la categoria TUBOLARE. Le colonne prodotti.prezzo_riferimento/
-- prezzo_s275j0h/prezzo_s355j2h restano invariate e continuano ad essere usate
-- da TRAVI/MERCANTILE/RETI/GRIGLIATI/OMEGA (semantica di "extra", non listino).
-- =============================================================================

BEGIN;

CREATE TABLE listini_tubolare (
    id          SERIAL          PRIMARY KEY,
    nome        VARCHAR(100)    NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE listino_tubolare_prezzi (
    id           SERIAL          PRIMARY KEY,
    id_listino   INTEGER         NOT NULL REFERENCES listini_tubolare(id) ON DELETE CASCADE,
    id_prodotto  INTEGER         NOT NULL REFERENCES prodotti(id),
    qualita      VARCHAR(30)     NOT NULL CHECK (qualita IN ('prezzo_riferimento', 'prezzo_s275j0h', 'prezzo_s355j2h')),
    prezzo       NUMERIC(14,6)   NOT NULL,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (id_listino, id_prodotto, qualita)
);

CREATE INDEX idx_listino_tubolare_prezzi_listino ON listino_tubolare_prezzi (id_listino);
CREATE INDEX idx_listino_tubolare_prezzi_prodotto ON listino_tubolare_prezzi (id_prodotto);

CREATE TRIGGER trg_listino_tubolare_prezzi_updated_at
    BEFORE UPDATE ON listino_tubolare_prezzi
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- Seed: listino corrente
-- -----------------------------------------------------------------------------
INSERT INTO listini_tubolare (nome) VALUES ('Listino 1/2026');


-- -----------------------------------------------------------------------------
-- Backfill: prezzi TUBOLARE già presenti su prodotti confluiscono in
-- "Listino 1/2026", una riga per qualità valorizzata
-- -----------------------------------------------------------------------------
INSERT INTO listino_tubolare_prezzi (id_listino, id_prodotto, qualita, prezzo)
SELECT (SELECT id FROM listini_tubolare WHERE nome = 'Listino 1/2026'),
       p.id, 'prezzo_riferimento', p.prezzo_riferimento
FROM prodotti p
JOIN categorie_prodotto c ON c.id = p.id_categoria
WHERE c.codice = 'TUBOLARE' AND p.prezzo_riferimento IS NOT NULL

UNION ALL

SELECT (SELECT id FROM listini_tubolare WHERE nome = 'Listino 1/2026'),
       p.id, 'prezzo_s275j0h', p.prezzo_s275j0h
FROM prodotti p
JOIN categorie_prodotto c ON c.id = p.id_categoria
WHERE c.codice = 'TUBOLARE' AND p.prezzo_s275j0h IS NOT NULL

UNION ALL

SELECT (SELECT id FROM listini_tubolare WHERE nome = 'Listino 1/2026'),
       p.id, 'prezzo_s355j2h', p.prezzo_s355j2h
FROM prodotti p
JOIN categorie_prodotto c ON c.id = p.id_categoria
WHERE c.codice = 'TUBOLARE' AND p.prezzo_s355j2h IS NOT NULL;


-- -----------------------------------------------------------------------------
-- Dizionario dati
-- -----------------------------------------------------------------------------
INSERT INTO _dizionario_dati (table_name, column_name, descrizione, note) VALUES
('listini_tubolare',        NULL, 'Elenco dei listini nazionali TUBOLARE pubblicati nel tempo', 'Contenitore nominato senza validità temporale; il più recente (id più alto) è il listino corrente'),
('listino_tubolare_prezzi', NULL, 'Prezzo per prodotto TUBOLARE, qualità e listino', 'Un prodotto ha fino a 3 righe (una per qualità) per ogni listino');

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listini_tubolare', 'nome', 'VARCHAR(100)', 'Nome del listino, assegnato dall''utente alla pubblicazione', 'Listino 1/2026', true),
('listino_tubolare_prezzi', 'qualita', 'VARCHAR(30)', 'Qualità acciaio a cui si riferisce il prezzo: prezzo_riferimento=S235JRH/DX51D, prezzo_s275j0h=S275J0H, prezzo_s355j2h=S355J2H', 'prezzo_riferimento', true),
('listino_tubolare_prezzi', 'prezzo', 'NUMERIC(14,6)', 'Prezzo di listino in €/unita_misura_acquisto del prodotto', '4.490000', true);


GRANT ALL ON listini_tubolare, listino_tubolare_prezzi TO procurement_user;
GRANT ALL ON listini_tubolare_id_seq, listino_tubolare_prezzi_id_seq TO procurement_user;

COMMIT;

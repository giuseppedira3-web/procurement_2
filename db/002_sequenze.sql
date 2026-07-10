-- Tabella sequenze per generazione codici documento (OA, DDT, FT) per fornitore+anno
CREATE TABLE IF NOT EXISTS _sequenze_documenti (
    id_fornitore  INTEGER    NOT NULL REFERENCES fornitori(id),
    tipo          VARCHAR(5) NOT NULL,   -- 'OA', 'DDT', 'FT'
    anno          SMALLINT   NOT NULL,
    ultimo        INTEGER    NOT NULL DEFAULT 0,
    PRIMARY KEY (id_fornitore, tipo, anno)
);

-- Funzione atomica per ottenere il prossimo progressivo (thread-safe)
CREATE OR REPLACE FUNCTION next_progressivo(
    p_fornitore INTEGER,
    p_tipo      VARCHAR,
    p_anno      INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_next INTEGER;
BEGIN
    INSERT INTO _sequenze_documenti (id_fornitore, tipo, anno, ultimo)
    VALUES (p_fornitore, p_tipo, p_anno, 1)
    ON CONFLICT (id_fornitore, tipo, anno) DO UPDATE
        SET ultimo = _sequenze_documenti.ultimo + 1
    RETURNING ultimo INTO v_next;
    RETURN v_next;
END;
$$ LANGUAGE plpgsql;

GRANT ALL ON _sequenze_documenti TO procurement_user;
GRANT EXECUTE ON FUNCTION next_progressivo TO procurement_user;

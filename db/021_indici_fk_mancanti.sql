-- =============================================================================
-- 021 — Indici mancanti su foreign key
--
-- ordini.id_vettore, ordini.id_magazzino_origine e listino_servizi.id_vettore
-- referenziano altre tabelle senza indice: ogni JOIN o DELETE su vettori/
-- magazzini_fornitore forza una scan completa di ordini/listino_servizi.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ordini_vettore           ON ordini(id_vettore);
CREATE INDEX IF NOT EXISTS idx_ordini_magazzino_origine  ON ordini(id_magazzino_origine);
CREATE INDEX IF NOT EXISTS idx_listino_servizi_vettore   ON listino_servizi(id_vettore);

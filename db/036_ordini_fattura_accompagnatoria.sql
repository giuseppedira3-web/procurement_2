-- =============================================================================
-- 036 — ORDINI: fattura accompagnatoria
--
-- Quando la merce arriva con fattura accompagnatoria l'ordine nasce già
-- consegnato: il backend crea un DDT (numero/data = quelli della fattura) e
-- per ogni riga ordine una riga DDT con la stessa quantità, tenendole
-- allineate a modifiche e cancellazioni. Il trigger su ddt_righe chiude poi
-- le righe ordine come per un DDT normale.
--
-- Il flag non è una colonna a sé: l'ordine è "con fattura accompagnatoria"
-- se ha il DDT collegato. Numero e data stanno sul DDT stesso. Se il DDT
-- viene eliminato dalla pagina DDT, il collegamento si azzera da solo.
-- Idempotente.
-- =============================================================================

BEGIN;

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS id_ddt_accompagnatoria INTEGER
        REFERENCES ddt(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordini_ddt_accompagnatoria
    ON ordini (id_ddt_accompagnatoria);

COMMIT;

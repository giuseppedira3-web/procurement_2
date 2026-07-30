-- =============================================================================
-- 016 — DDT: costo trasporto (fatturato dal vettore separatamente dal
-- materiale, come già avviene per la zincatura) + viste per calcolare il
-- prezzo "landed" (materiale + zincatura + trasporto) a livello di riga
-- ordine.
--
-- Il costo trasporto si registra sulla testata DDT (un vettore fattura per
-- l'intera spedizione, non prodotto per prodotto) e viene ripartito sulle
-- righe DDT in proporzione al peso (quantita_kg), poi aggregato sulla riga
-- ordine collegata: un ordine può essere consegnato su più DDT/vettori con
-- costi diversi, quindi il prezzo trasporto per riga ordine è una media
-- ponderata sui kg effettivamente consegnati con costo trasporto noto.
-- =============================================================================

ALTER TABLE ddt ADD COLUMN IF NOT EXISTS costo_trasporto NUMERIC(14,2);

-- dr.quantita_kg e' quasi sempre NULL nei dati reali (non viene ripopolato
-- quando l'unita' di misura e' gia' 'kg'): in quel caso quantita_consegnata
-- E' gia' il peso in kg, quindi lo usiamo come fallback per il riparto.
CREATE OR REPLACE VIEW v_trasporto_ddt_righe AS
SELECT
    dr.id                                                       AS id_ddt_riga,
    dr.id_ddt,
    dr.id_riga_ordine,
    COALESCE(dr.quantita_kg,
             CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END)
                                                                 AS peso_kg,
    d.costo_trasporto,
    CASE
        WHEN d.costo_trasporto IS NOT NULL
         AND COALESCE(dr.quantita_kg,
                       CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END) IS NOT NULL
         AND SUM(COALESCE(dr.quantita_kg,
                           CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END))
             OVER (PARTITION BY dr.id_ddt) > 0
        THEN ROUND(
            d.costo_trasporto
            * COALESCE(dr.quantita_kg,
                       CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END)
            / SUM(COALESCE(dr.quantita_kg,
                            CASE WHEN dr.unita_misura = 'kg' THEN dr.quantita_consegnata END))
              OVER (PARTITION BY dr.id_ddt), 2)
    END                                                          AS costo_trasporto_riga
FROM ddt_righe dr
JOIN ddt d ON d.id = dr.id_ddt;

CREATE OR REPLACE VIEW v_trasporto_righe_ordine AS
SELECT
    t.id_riga_ordine,
    SUM(t.costo_trasporto_riga)                                 AS costo_trasporto_tot,
    SUM(t.peso_kg) FILTER (WHERE t.costo_trasporto_riga IS NOT NULL)
                                                                 AS kg_con_trasporto,
    ROUND(
        SUM(t.costo_trasporto_riga)
        / NULLIF(SUM(t.peso_kg) FILTER (WHERE t.costo_trasporto_riga IS NOT NULL), 0)
    , 6)                                                         AS prezzo_trasporto_kg
FROM v_trasporto_ddt_righe t
WHERE t.id_riga_ordine IS NOT NULL
GROUP BY t.id_riga_ordine;

GRANT SELECT ON v_trasporto_ddt_righe TO procurement_user;
GRANT SELECT ON v_trasporto_righe_ordine TO procurement_user;

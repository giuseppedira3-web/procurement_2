-- =============================================================================
-- 017 — v_stato_ordini: aggiunge ha_righe_aperte, per distinguere gli ordini
-- che hanno almeno una riga (chiamata) aperta o parziale da quelli con tutte
-- le righe completate. Il contatore "Ordini aperti" e la tab "Avanzamento
-- Ordini" della dashboard si basavano sulla fatturazione (perc_fatturato),
-- ma la fatturazione non e' ancora tracciata in modo affidabile: per adesso
-- la nozione di "ordine aperto" si sposta sulle chiamate (righe ordine).
-- =============================================================================

CREATE OR REPLACE VIEW v_stato_ordini AS
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
        / NULLIF(SUM(r.quantita_ordinata), 0), 1)       AS perc_fatturato,
    o.id                                                 AS id_ordine,
    o.id_fornitore,
    o.anno,
    o.ditta,
    COALESCE(bool_or(r.stato_riga IN ('aperta', 'parziale')), false)
                                                         AS ha_righe_aperte
FROM ordini o
JOIN fornitori f ON f.id = o.id_fornitore
LEFT JOIN ordini_righe r ON r.id_ordine = o.id
GROUP BY o.id, o.codice_ordine, f.ragione_sociale,
         o.data_ordine, o.data_consegna_prevista, o.stato,
         o.id_fornitore, o.anno, o.ditta;

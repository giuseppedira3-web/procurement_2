-- =============================================================================
-- 012 — Multi-società: colonna "ditta" su ordini/ddt/fatture
--
-- L'anagrafica (fornitori, categorie, prodotti, listini, vettori...) resta
-- trasversale, condivisa tra le due società. I documenti (ordini/ddt/fatture)
-- vengono invece etichettati con la società di appartenenza.
--
-- Lo storico esistente viene assegnato a 'ditta2' (unica società con cui si è
-- lavorato finora): il DEFAULT sotto copre sia le righe già presenti che i
-- nuovi inserimenti che per qualche motivo non specificano il valore.
-- =============================================================================

ALTER TABLE ordini
    ADD COLUMN IF NOT EXISTS ditta VARCHAR(10) NOT NULL DEFAULT 'ditta2'
    CHECK (ditta IN ('ditta1', 'ditta2'));

ALTER TABLE ddt
    ADD COLUMN IF NOT EXISTS ditta VARCHAR(10) NOT NULL DEFAULT 'ditta2'
    CHECK (ditta IN ('ditta1', 'ditta2'));

ALTER TABLE fatture
    ADD COLUMN IF NOT EXISTS ditta VARCHAR(10) NOT NULL DEFAULT 'ditta2'
    CHECK (ditta IN ('ditta1', 'ditta2'));

CREATE INDEX IF NOT EXISTS idx_ordini_ditta  ON ordini(ditta);
CREATE INDEX IF NOT EXISTS idx_ddt_ditta     ON ddt(ditta);
CREATE INDEX IF NOT EXISTS idx_fatture_ditta ON fatture(ditta);

-- -----------------------------------------------------------------------------
-- Viste dashboard: esporre "ditta" per poterle filtrare per società
-- -----------------------------------------------------------------------------

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
    o.id AS id_ordine,
    o.id_fornitore,
    o.anno,
    o.ditta
FROM ordini o
JOIN fornitori f ON f.id = o.id_fornitore
LEFT JOIN ordini_righe r ON r.id_ordine = o.id
GROUP BY o.id, o.codice_ordine, f.ragione_sociale,
         o.data_ordine, o.data_consegna_prevista, o.stato,
         o.id_fornitore, o.anno, o.ditta;


CREATE OR REPLACE VIEW v_scostamenti_prezzi AS
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
    ft.data_fattura,
    ft.id_fornitore,
    ft.ditta
FROM fatture_righe fr
JOIN fatture ft ON ft.id = fr.id_fattura
JOIN fornitori f ON f.id = ft.id_fornitore
LEFT JOIN ordini_righe r ON r.id = fr.id_riga_ordine
LEFT JOIN ordini o ON o.id = fr.id_ordine
LEFT JOIN prodotti p ON p.id = fr.id_prodotto
WHERE fr.id_riga_ordine IS NOT NULL
  AND ft.stato NOT IN ('annullata', 'contestata');


CREATE OR REPLACE VIEW v_ddt_non_fatturati AS
SELECT
    d.codice_ddt,
    f.ragione_sociale       AS fornitore,
    d.data_ddt,
    d.data_ricezione,
    d.stato,
    COUNT(dr.id)            AS righe_totali,
    COUNT(dr.id) FILTER (WHERE dr.fatturato = false) AS righe_non_fatturate,
    d.id_fornitore,
    d.ditta
FROM ddt d
JOIN fornitori f ON f.id = d.id_fornitore
JOIN ddt_righe dr ON dr.id_ddt = d.id
WHERE d.stato != 'fatturato'
GROUP BY d.id, d.codice_ddt, f.ragione_sociale, d.data_ddt, d.data_ricezione, d.stato,
         d.id_fornitore, d.ditta
HAVING COUNT(dr.id) FILTER (WHERE dr.fatturato = false) > 0;


CREATE OR REPLACE VIEW v_esposizione_fornitore AS
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
    ft.valuta,
    ft.id_fornitore,
    ft.ditta
FROM fatture ft
JOIN fornitori f ON f.id = ft.id_fornitore
WHERE ft.stato NOT IN ('pagata', 'annullata')
GROUP BY f.id, f.codice_fornitore, f.ragione_sociale,
         ft.stato, ft.data_scadenza, ft.valuta, ft.id_fornitore, ft.ditta
ORDER BY ft.data_scadenza;

-- =============================================================================
-- 022 — LISTINI TUBOLARE: decorrenza (data_inizio / data_fine)
--
-- Finora "quale listino è quello corrente" non aveva una risposta affidabile
-- lato server (solo una scelta salvata nel browser di chi apriva la pagina
-- Listino Prezzi). Con la decorrenza, ogni ordine può essere associato al
-- listino effettivamente in vigore alla sua data_ordine: data_fine NULL
-- significa "ancora valido". data_fine, quando impostata, copre l'intero
-- mese indicato (es. data_fine = 2026-10-01 vale fino al 31/10/2026).
-- =============================================================================

ALTER TABLE listini_tubolare
    ADD COLUMN IF NOT EXISTS data_inizio DATE,
    ADD COLUMN IF NOT EXISTS data_fine   DATE;

INSERT INTO _dizionario_dati (table_name, column_name, data_type, descrizione, esempio, obbligatorio) VALUES
('listini_tubolare', 'data_inizio', 'DATE', 'Primo giorno del mese da cui il listino è in vigore', '2026-01-01', false),
('listini_tubolare', 'data_fine',   'DATE', 'Primo giorno del mese di validità, l''ultimo del listino: NULL = ancora in vigore. Il listino copre l''intero mese indicato', '2026-10-01', false);

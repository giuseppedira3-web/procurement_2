-- Semplificazione conversioni_peso: i fattori di conversione sono valori
-- fisici (es. kg/m di un profilato), quindi non hanno senso concetti di
-- validità temporale o di lunghezza di riferimento; la descrizione del
-- prodotto va recuperata da prodotti.descrizione per evitare discrepanze.

ALTER TABLE conversioni_peso DROP COLUMN lunghezza_riferimento_mm;
ALTER TABLE conversioni_peso DROP COLUMN valido_da;
ALTER TABLE conversioni_peso DROP COLUMN valido_a;
ALTER TABLE conversioni_peso DROP COLUMN descrizione;

DELETE FROM _dizionario_dati WHERE table_name = 'conversioni_peso' AND column_name = 'lunghezza_riferimento_mm';

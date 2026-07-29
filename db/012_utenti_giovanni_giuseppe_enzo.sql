-- =============================================================================
-- 011 — Rinomina "operatore" in "giovanni" (senza password) + nuovi utenti
--        "giuseppe" ed "enzo" (senza password)
-- =============================================================================

UPDATE utenti SET username = 'giovanni', nome_completo = 'Giovanni', password = NULL
WHERE username = 'operatore';

UPDATE tickets SET username = 'giovanni' WHERE username = 'operatore';
UPDATE log_attivita SET username = 'giovanni' WHERE username = 'operatore';

INSERT INTO utenti (username, nome_completo, ruolo, password) VALUES
    ('giuseppe', 'Giuseppe', 'operatore', NULL),
    ('enzo',     'Enzo',     'operatore', NULL)
ON CONFLICT (username) DO NOTHING;

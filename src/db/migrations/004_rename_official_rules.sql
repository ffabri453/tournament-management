BEGIN;

ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS chk_tournament_rules_modality;

UPDATE tournaments
SET rules = CASE rules
    WHEN 'fifa_futsal' THEN 'official_rules_football_5'
    WHEN 'ifab_small_sided' THEN 'official_rules_football_7'
    WHEN 'ifab_football' THEN 'official_rules_football_11'
    ELSE rules
END;

ALTER TABLE tournaments
    ADD CONSTRAINT chk_tournament_rules_modality
        CHECK (
            (modality = 'futbol_5' AND rules = 'official_rules_football_5')
            OR (modality = 'futbol_7' AND rules = 'official_rules_football_7')
            OR (modality = 'futbol_11' AND rules = 'official_rules_football_11')
        ) NOT VALID;

COMMIT;

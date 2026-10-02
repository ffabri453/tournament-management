BEGIN;

UPDATE tournaments
SET name = BTRIM(name),
    location = CASE LOWER(BTRIM(location))
        WHEN 'firmat' THEN 'Firmat'
        WHEN 'venado tuerto' THEN 'Venado Tuerto'
        WHEN 'rosario' THEN 'Rosario'
        WHEN 'elortondo' THEN 'Elortondo'
        ELSE BTRIM(location)
    END,
    format = 'knockout',
    modality = CASE
        WHEN modality = 'futbol_8' THEN 'futbol_7'
        ELSE modality
    END,
    max_teams = CASE
        WHEN max_teams BETWEEN 1 AND 4 THEN 4
        WHEN max_teams BETWEEN 5 AND 8 THEN 8
        WHEN max_teams BETWEEN 9 AND 16 THEN 16
        WHEN max_teams BETWEEN 17 AND 32 THEN 32
        ELSE max_teams
    END;

UPDATE tournaments
SET rules = CASE modality
    WHEN 'futbol_5' THEN 'fifa_futsal'
    WHEN 'futbol_7' THEN 'ifab_small_sided'
    WHEN 'futbol_11' THEN 'ifab_football'
    ELSE rules
END;

UPDATE teams SET name = BTRIM(name);

ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS chk_tournament_format,
    DROP CONSTRAINT IF EXISTS chk_tournament_modality,
    DROP CONSTRAINT IF EXISTS chk_tournament_max_teams,
    DROP CONSTRAINT IF EXISTS chk_tournament_name,
    DROP CONSTRAINT IF EXISTS chk_tournament_location,
    DROP CONSTRAINT IF EXISTS chk_tournament_rules_modality;

ALTER TABLE tournaments
    ADD CONSTRAINT chk_tournament_format
        CHECK (format = 'knockout') NOT VALID,
    ADD CONSTRAINT chk_tournament_modality
        CHECK (modality IN ('futbol_5', 'futbol_7', 'futbol_11')) NOT VALID,
    ADD CONSTRAINT chk_tournament_max_teams
        CHECK (max_teams IN (4, 8, 16, 32)) NOT VALID,
    ADD CONSTRAINT chk_tournament_name
        CHECK (
            BTRIM(name) <> ''
            AND BTRIM(name) !~ '^[0-9]+([.,][0-9]+)?$'
        ) NOT VALID,
    ADD CONSTRAINT chk_tournament_location
        CHECK (location IN ('Firmat', 'Venado Tuerto', 'Rosario', 'Elortondo')) NOT VALID,
    ADD CONSTRAINT chk_tournament_rules_modality
        CHECK (
            (modality = 'futbol_5' AND rules = 'fifa_futsal')
            OR (modality = 'futbol_7' AND rules = 'ifab_small_sided')
            OR (modality = 'futbol_11' AND rules = 'ifab_football')
        ) NOT VALID;

ALTER TABLE teams
    DROP CONSTRAINT IF EXISTS chk_team_players_count,
    DROP CONSTRAINT IF EXISTS chk_team_name,
    DROP CONSTRAINT IF EXISTS unique_team_name_per_tournament;

ALTER TABLE teams
    ADD CONSTRAINT chk_team_players_count
        CHECK (players_count BETWEEN 5 AND 22) NOT VALID,
    ADD CONSTRAINT chk_team_name
        CHECK (
            BTRIM(name) <> ''
            AND BTRIM(name) !~ '^[0-9]+([.,][0-9]+)?$'
        ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS unique_team_name_per_tournament
ON teams (
    tournament_id,
    LOWER(BTRIM(name))
);

ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS chk_match_round,
    DROP CONSTRAINT IF EXISTS chk_match_location,
    DROP CONSTRAINT IF EXISTS chk_match_result_consistency;

ALTER TABLE matches
    ADD CONSTRAINT chk_match_round
        CHECK (round IN ('round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final')) NOT VALID,
    ADD CONSTRAINT chk_match_location
        CHECK (
            BTRIM(location) <> ''
            AND BTRIM(location) !~ '^[0-9]+([.,][0-9]+)?$'
        ) NOT VALID,
    ADD CONSTRAINT chk_match_result_consistency
        CHECK (
            (status = 'scheduled'
                AND home_goals IS NULL
                AND away_goals IS NULL
                AND winner_team_id IS NULL)
            OR (status = 'live'
                AND home_goals IS NOT NULL
                AND away_goals IS NOT NULL
                AND winner_team_id IS NULL)
            OR (status = 'suspended'
                AND ((home_goals IS NULL AND away_goals IS NULL)
                    OR (home_goals IS NOT NULL AND away_goals IS NOT NULL))
                AND winner_team_id IS NULL)
            OR (status = 'finished'
                AND home_goals IS NOT NULL
                AND away_goals IS NOT NULL
                AND home_goals <> away_goals
                AND winner_team_id = CASE
                    WHEN home_goals > away_goals THEN home_team_id
                    ELSE away_team_id
                END)
        ) NOT VALID;

COMMIT;

-- The NOT VALID constraints protect new and updated rows immediately.
-- After legacy rows are corrected, validate each constraint with:
-- ALTER TABLE <table> VALIDATE CONSTRAINT <constraint_name>;

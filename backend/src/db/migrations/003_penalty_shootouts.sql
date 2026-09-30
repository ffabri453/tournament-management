BEGIN;

ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS home_penalties INTEGER DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS away_penalties INTEGER DEFAULT NULL;

ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS chk_match_home_penalties,
    DROP CONSTRAINT IF EXISTS chk_match_away_penalties,
    DROP CONSTRAINT IF EXISTS chk_match_result_consistency;

ALTER TABLE matches
    ADD CONSTRAINT chk_match_home_penalties
        CHECK (home_penalties IS NULL OR home_penalties >= 0) NOT VALID,
    ADD CONSTRAINT chk_match_away_penalties
        CHECK (away_penalties IS NULL OR away_penalties >= 0) NOT VALID,
    ADD CONSTRAINT chk_match_result_consistency
        CHECK (
            (status = 'scheduled'
                AND home_goals IS NULL
                AND away_goals IS NULL
                AND home_penalties IS NULL
                AND away_penalties IS NULL
                AND winner_team_id IS NULL)
            OR (status = 'live'
                AND home_goals IS NOT NULL
                AND away_goals IS NOT NULL
                AND home_penalties IS NULL
                AND away_penalties IS NULL
                AND winner_team_id IS NULL)
            OR (status = 'suspended'
                AND ((home_goals IS NULL AND away_goals IS NULL)
                    OR (home_goals IS NOT NULL AND away_goals IS NOT NULL))
                AND home_penalties IS NULL
                AND away_penalties IS NULL
                AND winner_team_id IS NULL)
            OR (status = 'finished'
                AND home_goals IS NOT NULL
                AND away_goals IS NOT NULL
                AND (
                    (home_goals <> away_goals
                        AND home_penalties IS NULL
                        AND away_penalties IS NULL
                        AND winner_team_id = CASE
                            WHEN home_goals > away_goals THEN home_team_id
                            ELSE away_team_id
                        END)
                    OR (home_goals = away_goals
                        AND home_penalties IS NOT NULL
                        AND away_penalties IS NOT NULL
                        AND home_penalties <> away_penalties
                        AND winner_team_id = CASE
                            WHEN home_penalties > away_penalties THEN home_team_id
                            ELSE away_team_id
                        END)
                ))
        ) NOT VALID;

COMMIT;

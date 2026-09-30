BEGIN;

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS champion_team_id INTEGER DEFAULT NULL;

ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS fk_tournament_champion,
    DROP CONSTRAINT IF EXISTS chk_tournament_champion_consistency;

ALTER TABLE tournaments
    ADD CONSTRAINT fk_tournament_champion
        FOREIGN KEY (champion_team_id, id)
        REFERENCES teams(id, tournament_id)
        ON DELETE RESTRICT
        NOT VALID,
    ADD CONSTRAINT chk_tournament_champion_consistency
        CHECK (
            (status = 'finished' AND champion_team_id IS NOT NULL)
            OR (status IN ('open', 'in_progress') AND champion_team_id IS NULL)
        ) NOT VALID;

COMMIT;

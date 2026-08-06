BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS unique_tournament_name_location
ON tournaments (
    LOWER(BTRIM(name)),
    location
);

ALTER TABLE teams
    DROP COLUMN IF EXISTS captain,
    DROP COLUMN IF EXISTS city;

COMMIT;

BEGIN;

-- Los torneos anteriores quedan sin propietario y solo los administra un admin.
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS organizer_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tournaments_organizer_id ON tournaments (organizer_id);

COMMIT;

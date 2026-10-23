BEGIN;

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS logo_data BYTEA DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS logo_mime_type VARCHAR(10) DEFAULT NULL;

ALTER TABLE teams
    DROP CONSTRAINT IF EXISTS chk_team_logo_consistency;

ALTER TABLE teams
    ADD CONSTRAINT chk_team_logo_consistency
        CHECK (
            (logo_data IS NULL AND logo_mime_type IS NULL)
            OR (
                logo_data IS NOT NULL
                AND logo_mime_type IN ('image/png', 'image/jpeg', 'image/webp')
                AND OCTET_LENGTH(logo_data) BETWEEN 1 AND 1048576
            )
        ) NOT VALID;

ALTER TABLE teams
    VALIDATE CONSTRAINT chk_team_logo_consistency;

COMMIT;

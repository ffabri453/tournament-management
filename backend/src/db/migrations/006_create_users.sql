BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'organizer',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_name CHECK (BTRIM(name) <> ''),
    CONSTRAINT chk_user_email CHECK (BTRIM(email) <> ''),
    CONSTRAINT chk_user_password_hash CHECK (BTRIM(password_hash) <> ''),
    CONSTRAINT chk_user_role CHECK (role IN ('admin', 'organizer'))
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_email
ON users (LOWER(BTRIM(email)));

COMMIT;

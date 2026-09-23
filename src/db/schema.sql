-- =========================================================
-- TABLE: tournaments
-- Guarda los torneos de fútbol creados en el sistema.
-- Cada torneo tiene nombre, ubicación, reglas, formato,
-- modalidad, cantidad máxima de equipos y estado.
-- =========================================================

CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,                         -- Identificador único del torneo. Se genera automáticamente.

    name VARCHAR(100) NOT NULL,                    -- Nombre del torneo. Ejemplo: "Copa Ciudad 2026".

    location VARCHAR(100) NOT NULL,                -- Lugar general donde se juega el torneo. Ejemplo: "Venado Tuerto".

    rules VARCHAR(30) NOT NULL,                    -- Identificador del reglamento compartido por modalidad.

    format VARCHAR(50) NOT NULL DEFAULT 'knockout', -- Formato único habilitado por ahora.

    modality VARCHAR(30) NOT NULL DEFAULT 'futbol_11',
                                                      -- Modalidad de fútbol: futbol_5, futbol_7 o futbol_11.

    max_teams INTEGER NOT NULL,                    -- Cantidad máxima de equipos permitidos en el torneo.

    status VARCHAR(20) NOT NULL DEFAULT 'open',    -- Estado del torneo: open, in_progress o finished.

    champion_team_id INTEGER DEFAULT NULL,         -- Equipo campeón. Se define al finalizar la final.

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                      -- Fecha y hora en que se creó el torneo.

    CONSTRAINT chk_tournament_format
        CHECK (format = 'knockout'),
                                                      -- Evita que se cargue un formato inválido.

    CONSTRAINT chk_tournament_modality
        CHECK (modality IN ('futbol_5', 'futbol_7', 'futbol_11')),
                                                      -- Evita que se cargue una modalidad de fútbol inválida.

    CONSTRAINT chk_tournament_max_teams
        CHECK (max_teams IN (4, 8, 16, 32)),
                                                      -- Evita torneos con cantidad máxima de equipos inválida.

    CONSTRAINT chk_tournament_status
        CHECK (status IN ('open', 'in_progress', 'finished')),
                                                      -- Evita estados inválidos para el torneo.

    CONSTRAINT chk_tournament_champion_consistency
        CHECK (
            (status = 'finished' AND champion_team_id IS NOT NULL)
            OR (status IN ('open', 'in_progress') AND champion_team_id IS NULL)
        ),
                                                      -- El campeón sólo existe cuando el torneo está finalizado.

    CONSTRAINT chk_tournament_name
        CHECK (
            BTRIM(name) <> ''
            AND BTRIM(name) !~ '^[0-9]+([.,][0-9]+)?$'
        ),

    CONSTRAINT chk_tournament_location
        CHECK (location IN ('Firmat', 'Venado Tuerto', 'Rosario', 'Elortondo')),

    CONSTRAINT chk_tournament_rules_modality
        CHECK (
            (modality = 'futbol_5' AND rules = 'official_rules_football_5')
            OR (modality = 'futbol_7' AND rules = 'official_rules_football_7')
            OR (modality = 'futbol_11' AND rules = 'official_rules_football_11')
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_tournament_name_location
ON tournaments (
    LOWER(BTRIM(name)),
    location
);


-- =========================================================
-- TABLE: teams
-- Guarda los equipos que participan en un torneo.
-- Cada equipo pertenece a un torneo específico.
-- =========================================================

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,                         -- Identificador único del equipo. Se genera automáticamente.

    tournament_id INTEGER NOT NULL,                -- Identificador del torneo al que pertenece el equipo.

    name VARCHAR(100) NOT NULL,                    -- Nombre del equipo. Ejemplo: "Los Halcones".

    players_count INTEGER NOT NULL,                -- Cantidad de jugadores cargados o declarados para el equipo.

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                      -- Fecha y hora en que se creó el equipo.

    CONSTRAINT fk_team_tournament
        FOREIGN KEY (tournament_id)
        REFERENCES tournaments(id)
        ON DELETE CASCADE,
                                                      -- Relaciona el equipo con un torneo.
                                                      -- Si se elimina el torneo, también se eliminan sus equipos.

    CONSTRAINT chk_team_players_count
        CHECK (players_count BETWEEN 5 AND 22),
                                                      -- Evita equipos con 0 jugadores o cantidad negativa.

    CONSTRAINT chk_team_name
        CHECK (
            BTRIM(name) <> ''
            AND BTRIM(name) !~ '^[0-9]+([.,][0-9]+)?$'
        ),

    CONSTRAINT unique_team_id_tournament
        UNIQUE (id, tournament_id)
                                                      -- Permite validar desde matches que el equipo pertenece al torneo correcto.
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_team_name_per_tournament
ON teams (
    tournament_id,
    LOWER(BTRIM(name))
);

ALTER TABLE tournaments
    ADD CONSTRAINT fk_tournament_champion
        FOREIGN KEY (champion_team_id, id)
        REFERENCES teams(id, tournament_id)
        ON DELETE RESTRICT;
                                                      -- El campeón debe pertenecer al mismo torneo y conservarse.


-- =========================================================
-- TABLE: matches
-- Guarda los partidos de cada torneo.
-- Cada partido pertenece a un torneo y tiene dos equipos:
-- local y visitante.
-- =========================================================

CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,                         -- Identificador único del partido. Se genera automáticamente.

    tournament_id INTEGER NOT NULL,                -- Identificador del torneo al que pertenece el partido.

    home_team_id INTEGER NOT NULL,                 -- Equipo local.

    away_team_id INTEGER NOT NULL,                 -- Equipo visitante.

    match_date TIMESTAMP NOT NULL,                 -- Fecha y hora programada del partido.

    location VARCHAR(100) NOT NULL,                -- Cancha o lugar específico. Ejemplo: "Cancha 1".

    round VARCHAR(50) NOT NULL,                    -- Instancia del torneo. Ejemplo: "Round 1", "Quarter finals".

    home_goals INTEGER DEFAULT NULL,               -- Goles del equipo local. NULL si todavía no se jugó.

    away_goals INTEGER DEFAULT NULL,               -- Goles del equipo visitante. NULL si todavía no se jugó.

    home_penalties INTEGER DEFAULT NULL,           -- Penales convertidos por el equipo local en un desempate.

    away_penalties INTEGER DEFAULT NULL,           -- Penales convertidos por el equipo visitante en un desempate.

    winner_team_id INTEGER DEFAULT NULL,           -- Ganador por goles o, si hubo empate, por penales.

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
                                                      -- Estado del partido: scheduled, live, finished o suspended.

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                      -- Fecha y hora en que se creó el partido.

    CONSTRAINT fk_match_tournament
        FOREIGN KEY (tournament_id)
        REFERENCES tournaments(id)
        ON DELETE CASCADE,
                                                      -- Relaciona el partido con un torneo.
                                                      -- Si se elimina el torneo, también se eliminan sus partidos.

    CONSTRAINT fk_match_home_team
        FOREIGN KEY (home_team_id, tournament_id)
        REFERENCES teams(id, tournament_id),
                                                      -- Valida que el equipo local exista y pertenezca al mismo torneo.

    CONSTRAINT fk_match_away_team
        FOREIGN KEY (away_team_id, tournament_id)
        REFERENCES teams(id, tournament_id),
                                                      -- Valida que el equipo visitante exista y pertenezca al mismo torneo.

    CONSTRAINT fk_match_winner_team
        FOREIGN KEY (winner_team_id, tournament_id)
        REFERENCES teams(id, tournament_id),
                                                      -- Valida que el ganador exista y pertenezca al mismo torneo.
                                                      -- Si winner_team_id es NULL, no se aplica esta validación.

    CONSTRAINT chk_match_different_teams
        CHECK (home_team_id <> away_team_id),
                                                      -- Evita que un equipo juegue contra sí mismo.

    CONSTRAINT chk_match_home_goals
        CHECK (home_goals IS NULL OR home_goals >= 0),
                                                      -- Evita goles negativos para el equipo local.

    CONSTRAINT chk_match_away_goals
        CHECK (away_goals IS NULL OR away_goals >= 0),
                                                      -- Evita goles negativos para el equipo visitante.

    CONSTRAINT chk_match_home_penalties
        CHECK (home_penalties IS NULL OR home_penalties >= 0),

    CONSTRAINT chk_match_away_penalties
        CHECK (away_penalties IS NULL OR away_penalties >= 0),

    CONSTRAINT chk_match_winner_team
        CHECK (
            winner_team_id IS NULL
            OR winner_team_id = home_team_id
            OR winner_team_id = away_team_id
        ),
                                                      -- El ganador solo puede ser el local, el visitante o NULL.

    CONSTRAINT chk_match_status
        CHECK (status IN ('scheduled', 'live', 'finished', 'suspended')),
                                                      -- Evita estados inválidos para el partido.

    CONSTRAINT chk_match_round
        CHECK (round IN ('round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final')),

    CONSTRAINT chk_match_location
        CHECK (
            BTRIM(location) <> ''
            AND BTRIM(location) !~ '^[0-9]+([.,][0-9]+)?$'
        ),

    CONSTRAINT chk_match_result_consistency
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
        )
);


-- =========================================================
-- UNIQUE INDEX: unique_match_pair_per_round
-- Evita cargar dos veces el mismo partido en la misma ronda.
-- También evita duplicados invertidos:
-- Equipo A vs Equipo B y Equipo B vs Equipo A en la misma ronda.
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_match_pair_per_round
ON matches (
    tournament_id,                                  -- Torneo donde se juega el partido.
    round,                                          -- Ronda o instancia del torneo.
    LEAST(home_team_id, away_team_id),              -- Equipo con menor id, sin importar si es local o visitante.
    GREATEST(home_team_id, away_team_id)            -- Equipo con mayor id, sin importar si es local o visitante.
);

-- Guarda usuarios sin relacionarlos todavia con los torneos.
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

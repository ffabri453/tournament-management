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

    rules TEXT NOT NULL,                           -- Reglas generales del torneo. Se usa TEXT porque puede ser largo.

    format VARCHAR(50) NOT NULL,                   -- Formato del torneo: league, knockout o group_stage.

    modality VARCHAR(20) NOT NULL DEFAULT 'football_11',
                                                      -- Modalidad de fútbol: football_5, football_7, football_8 o football_11.

    max_teams INTEGER NOT NULL,                    -- Cantidad máxima de equipos permitidos en el torneo.

    status VARCHAR(20) NOT NULL DEFAULT 'open',    -- Estado del torneo: open, in_progress o finished.

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                      -- Fecha y hora en que se creó el torneo.

    CONSTRAINT chk_tournament_format
        CHECK (format IN ('league', 'knockout', 'group_stage')),
                                                      -- Evita que se cargue un formato inválido.

    CONSTRAINT chk_tournament_modality
        CHECK (modality IN ('football_5', 'football_7', 'football_8', 'football_11')),
                                                      -- Evita que se cargue una modalidad de fútbol inválida.

    CONSTRAINT chk_tournament_max_teams
        CHECK (max_teams >= 2),
                                                      -- Un torneo necesita al menos 2 equipos.

    CONSTRAINT chk_tournament_status
        CHECK (status IN ('open', 'in_progress', 'finished'))
                                                      -- Evita estados inválidos para el torneo.
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

    captain VARCHAR(100) NOT NULL,                 -- Nombre del capitán o responsable del equipo.

    city VARCHAR(100) NOT NULL,                    -- Ciudad de origen del equipo.

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
        CHECK (players_count > 0),
                                                      -- Evita equipos con 0 jugadores o cantidad negativa.

    CONSTRAINT unique_team_name_per_tournament
        UNIQUE (tournament_id, name),
                                                      -- Evita que dos equipos tengan el mismo nombre dentro del mismo torneo.

    CONSTRAINT unique_team_id_tournament
        UNIQUE (id, tournament_id)
                                                      -- Permite validar desde matches que el equipo pertenece al torneo correcto.
);


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

    winner_team_id INTEGER DEFAULT NULL,           -- Equipo ganador. NULL si no se jugó o si terminó empatado.

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

    CONSTRAINT chk_match_winner_team
        CHECK (
            winner_team_id IS NULL
            OR winner_team_id = home_team_id
            OR winner_team_id = away_team_id
        ),
                                                      -- El ganador solo puede ser el local, el visitante o NULL.

    CONSTRAINT chk_match_status
        CHECK (status IN ('scheduled', 'live', 'finished', 'suspended'))
                                                      -- Evita estados inválidos para el partido.
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
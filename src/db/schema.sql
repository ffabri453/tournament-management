CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100) NOT NULL, 
    rules TEXT NOT NULL,
    format VARCHAR(50) NOT NULL,   -- 'liga', 'eliminatoria', 'fase_grupos'
    
    -- Modalidad del torneo de fútbol
    modality VARCHAR(20) NOT NULL DEFAULT 'futbol_11', 
    
    max_teams INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'finished'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Restricción para asegurar modalidades válidas
    CONSTRAINT chk_modality CHECK (modality IN ('futbol_5', 'futbol_7', 'futbol_8', 'futbol_11',))
);

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    captain VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    players_count INTEGER NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL,
    home_team_id INTEGER NOT NULL,
    away_team_id INTEGER NOT NULL,
    
    match_date TIMESTAMP NOT NULL,
    location VARCHAR(100) NOT NULL,     -- Cancha específica (ej: "Cancha 1")
    round VARCHAR(50) NOT NULL,        -- Ej: "Fecha 1", "Cuartos de final"
    
    -- Goles específicos de fútbol (inician en NULL hasta que se juegue)
    home_goals INTEGER DEFAULT NULL,    
    away_goals INTEGER DEFAULT NULL,
    
    winner_team_id INTEGER,            -- NULL si el partido quedó empatado o no se jugó
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'live', 'finished', 'suspended'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tournament
        FOREIGN KEY (tournament_id)
        REFERENCES tournaments(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_home_team
        FOREIGN KEY (home_team_id)
        REFERENCES teams(id),

    CONSTRAINT fk_away_team
        FOREIGN KEY (away_team_id)
        REFERENCES teams(id),

    CONSTRAINT fk_winner_team
        FOREIGN KEY (winner_team_id)
        REFERENCES teams(id)
);
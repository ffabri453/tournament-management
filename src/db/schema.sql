CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sport VARCHAR(50) NOT NULL,
    location VARCHAR(100) NOT NULL,
    rules TEXT NOT NULL,
    format VARCHAR(50) NOT NULL,
    max_teams INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    location VARCHAR(100) NOT NULL,
    round VARCHAR(50) NOT NULL,

    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,

    winner_team_id INTEGER,

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',

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
import pool from '../config/db';
export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  captain: string;
  city: string;
  players_count: number;
  created_at: Date;
}

export interface CreateTeamInput {
  tournament_id: number;
  name: string;
  captain: string;
  city: string;
  players_count: number;
}

export const getAllTeams = async (): Promise<Team[]> => {
  const result = await pool.query(`
    SELECT id, tournament_id, name, captain, city, players_count, created_at
    FROM teams
    ORDER BY id ASC
  `);

  return result.rows;
};

export const getTeamById = async (id: number): Promise<Team | null> => {
  const result = await pool.query(
    `
    SELECT id, tournament_id, name, captain, city, players_count, created_at
    FROM teams
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
};

export const createTeam = async (team: CreateTeamInput): Promise<Team> => {
  const result = await pool.query(
    `
    INSERT INTO teams (tournament_id, name, captain, city, players_count)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, tournament_id, name, captain, city, players_count, created_at
    `,
    [team.tournament_id, team.name, team.captain, team.city, team.players_count]
  );

  return result.rows[0];
};

export const updateTeam = async (
  id: number,
  team: CreateTeamInput
): Promise<Team | null> => {
  const result = await pool.query(
    `
    UPDATE teams
    SET tournament_id = $1,
        name = $2,
        captain = $3,
        city = $4,
        players_count = $5
    WHERE id = $6
    RETURNING id, tournament_id, name, captain, city, players_count, created_at
    `,
    [team.tournament_id, team.name, team.captain, team.city, team.players_count, id]
  );

  return result.rows[0] ?? null;
};

export const deleteTeam = async (id: number): Promise<boolean> => {
  const result = await pool.query(
    `
    DELETE FROM teams
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

 return (result.rowCount ?? 0) > 0;
};
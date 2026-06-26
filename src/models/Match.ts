import pool from '../config/db';

export interface Match {
  id: number;
  tournament_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: Date;
  location: string;
  round: string;
  home_goals: number | null;
  away_goals: number | null;
  winner_team_id: number | null;
  status: string;
}

export const getAllMatches = async (): Promise<Match[]> => {
  const result = await pool.query(
    `SELECT *
     FROM matches
     ORDER BY id ASC`
  );

  return result.rows;
};

export const getMatchById = async (
  id: number
): Promise<Match | null> => {

  const result = await pool.query(
    `SELECT *
     FROM matches
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

export const createMatch = async (
  tournament_id: number,
  home_team_id: number,
  away_team_id: number,
  match_date: Date,
  location: string,
  round: string,
  status: string
): Promise<Match> => {

  const result = await pool.query(
    `INSERT INTO matches (
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      status
    ]
  );

  return result.rows[0];
};

export const deleteMatch = async (
  id: number
): Promise<boolean> => {

  const result = await pool.query(
    `DELETE FROM matches
     WHERE id = $1`,
    [id]
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const updateMatch = async (
  id: number,
  tournament_id: number,
  home_team_id: number,
  away_team_id: number,
  match_date: Date,
  location: string,
  round: string,
  home_goals: number | null,
  away_goals: number | null,
  winner_team_id: number | null,
  status: string
): Promise<Match | null> => {

  const result = await pool.query(
    `UPDATE matches
     SET
       tournament_id = $1,
       home_team_id = $2,
       away_team_id = $3,
       match_date = $4,
       location = $5,
       round = $6,
       home_goals = $7,
       away_goals = $8,
       winner_team_id = $9,
       status = $10
     WHERE id = $11
     RETURNING *`,
    [
      tournament_id,
      home_team_id,
      away_team_id,
      match_date,
      location,
      round,
      home_goals,
      away_goals,
      winner_team_id,
      status,
      id
    ]
  );

  return result.rows[0] || null;
};
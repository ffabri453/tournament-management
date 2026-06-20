import pool from '../config/db';

export interface Tournament {
  id: number;
  name: string;
  sport: string;
  location: string;
  rules: string;
  format: string;
  status: string;
  created_at: Date;
}

export const getAllTournaments = async (): Promise<Tournament[]> => {
  const result = await pool.query(
    `SELECT id, name, sport, location, rules, format, status, created_at
     FROM tournaments
     ORDER BY id ASC`
  );

  return result.rows;
};
import pool from '../config/db';
import {
  MatchRound,
  MatchStatus,
  TournamentCapacity
} from '../domain/competitionRules';

export interface Match {
  id: number;
  tournament_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: Date;
  location: string;
  round: MatchRound;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: number | null;
  status: MatchStatus;
  created_at: Date;
}

export interface MatchInput {
  tournament_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: Date;
  location: string;
  round: MatchRound;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: number | null;
  status: MatchStatus;
}

export interface MatchValidationContext {
  max_teams: TournamentCapacity;
  tournament_status: string;
  home_team_exists: boolean;
  away_team_exists: boolean;
  team_round_conflict: boolean;
}

const matchSelect = `
  id, tournament_id, home_team_id, away_team_id, match_date, location, round,
  home_goals, away_goals, home_penalties, away_penalties,
  winner_team_id, status, created_at
`;

export const getAllMatches = async (): Promise<Match[]> => {
  const result = await pool.query(
    `SELECT ${matchSelect}
     FROM matches
     ORDER BY id ASC`
  );
  return result.rows;
};

export const getMatchById = async (id: number): Promise<Match | null> => {
  const result = await pool.query(
    `SELECT ${matchSelect}
     FROM matches
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
};

export const getMatchValidationContext = async (
  tournamentId: number,
  homeTeamId: number,
  awayTeamId: number,
  round: MatchRound,
  excludedMatchId: number | null
): Promise<MatchValidationContext | null> => {
  const result = await pool.query<MatchValidationContext>(
    `SELECT t.max_teams,
            t.status AS tournament_status,
            EXISTS (
              SELECT 1 FROM teams
              WHERE id = $2 AND tournament_id = t.id
            ) AS home_team_exists,
            EXISTS (
              SELECT 1 FROM teams
              WHERE id = $3 AND tournament_id = t.id
            ) AS away_team_exists,
            EXISTS (
              SELECT 1
              FROM matches m
              WHERE m.tournament_id = t.id
                AND m.round = $4
                AND ($5::integer IS NULL OR m.id <> $5)
                AND (
                  m.home_team_id IN ($2, $3)
                  OR m.away_team_id IN ($2, $3)
                )
            ) AS team_round_conflict
     FROM tournaments t
     WHERE t.id = $1`,
    [tournamentId, homeTeamId, awayTeamId, round, excludedMatchId]
  );
  return result.rows[0] ?? null;
};

export const createMatch = async (match: MatchInput): Promise<Match> => {
  const result = await pool.query<Match>(
    `INSERT INTO matches (
       tournament_id, home_team_id, away_team_id, match_date, location, round,
       home_goals, away_goals, home_penalties, away_penalties,
       winner_team_id, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${matchSelect}`,
    [
      match.tournament_id,
      match.home_team_id,
      match.away_team_id,
      match.match_date,
      match.location,
      match.round,
      match.home_goals,
      match.away_goals,
      match.home_penalties,
      match.away_penalties,
      match.winner_team_id,
      match.status
    ]
  );
  return result.rows[0]!;
};

export const updateMatch = async (id: number, match: MatchInput): Promise<Match | null> => {
  const result = await pool.query<Match>(
    `UPDATE matches
     SET tournament_id = $1,
         home_team_id = $2,
         away_team_id = $3,
         match_date = $4,
         location = $5,
         round = $6,
         home_goals = $7,
         away_goals = $8,
         home_penalties = $9,
         away_penalties = $10,
         winner_team_id = $11,
         status = $12
     WHERE id = $13
     RETURNING ${matchSelect}`,
    [
      match.tournament_id,
      match.home_team_id,
      match.away_team_id,
      match.match_date,
      match.location,
      match.round,
      match.home_goals,
      match.away_goals,
      match.home_penalties,
      match.away_penalties,
      match.winner_team_id,
      match.status,
      id
    ]
  );
  return result.rows[0] ?? null;
};

export const deleteMatch = async (id: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING id', [id]);
  return (result.rowCount ?? 0) > 0;
};

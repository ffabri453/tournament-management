import pool from '../config/db';
import { PoolClient } from 'pg';
import {
  DomainError,
  MatchRound,
  MatchStatus,
  TournamentCapacity,
  TournamentStatus
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

type MatchQueryClient = Pick<PoolClient, 'query'>;

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

export const createMatch = async (
  match: MatchInput,
  queryClient: MatchQueryClient = pool
): Promise<Match> => {
  const result = await queryClient.query<Match>(
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

export const validateManualMatchCreation = (status: TournamentStatus): void => {
  if (status !== 'open') {
    throw new DomainError(
      'MANUAL_MATCH_CREATION_LOCKED',
      'Manual matches can only be created while the tournament is open'
    );
  }
};

export const createManualMatch = async (match: MatchInput): Promise<Match> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query<{ status: TournamentStatus }>(
      `SELECT status
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [match.tournament_id]
    );
    const tournament = tournamentResult.rows[0];

    if (!tournament) {
      throw new DomainError('TOURNAMENT_NOT_FOUND', 'Tournament not found');
    }

    validateManualMatchCreation(tournament.status);

    const created = await createMatch(match, client);
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const validateMatchEditable = (
  current: Match,
  match: MatchInput,
  currentTournamentStatus: TournamentStatus,
  targetTournamentStatus: TournamentStatus
): void => {
  if (current.status === 'finished') {
    throw new DomainError(
      'MATCH_FINISHED_LOCKED',
      'A finished match cannot be modified'
    );
  }

  if (currentTournamentStatus === 'finished') {
    throw new DomainError(
      'TOURNAMENT_MATCHES_LOCKED',
      'Matches in a finished tournament cannot be modified'
    );
  }

  if (currentTournamentStatus === 'in_progress') {
    const structureChanged =
      current.tournament_id !== match.tournament_id ||
      current.home_team_id !== match.home_team_id ||
      current.away_team_id !== match.away_team_id ||
      current.location !== match.location ||
      current.round !== match.round;

    if (structureChanged) {
      throw new DomainError(
        'MATCH_STRUCTURE_LOCKED',
        'Tournament, participants, location and round are locked after start'
      );
    }
  }

  if (
    current.tournament_id !== match.tournament_id &&
    targetTournamentStatus !== 'open'
  ) {
    throw new DomainError(
      'MATCH_TARGET_TOURNAMENT_LOCKED',
      'A match can only be moved to an open tournament'
    );
  }
};

export const validateMatchDeletable = (
  matchStatus: MatchStatus,
  tournamentStatus: TournamentStatus
): void => {
  if (matchStatus === 'finished' || tournamentStatus !== 'open') {
    throw new DomainError(
      'MATCH_DELETE_LOCKED',
      'A match cannot be deleted after it is finished or its tournament has started'
    );
  }
};

export const updateMatch = async (id: number, match: MatchInput): Promise<Match | null> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query<Match>(
      `SELECT ${matchSelect}
       FROM matches
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];

    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    const tournamentIds = [...new Set([current.tournament_id, match.tournament_id])].sort(
      (left, right) => left - right
    );
    const tournamentResult = await client.query<{ id: number; status: TournamentStatus }>(
      `SELECT id, status
       FROM tournaments
       WHERE id = ANY($1::integer[])
       ORDER BY id ASC
       FOR UPDATE`,
      [tournamentIds]
    );
    const statuses = new Map(
      tournamentResult.rows.map((tournament) => [tournament.id, tournament.status])
    );
    const currentTournamentStatus = statuses.get(current.tournament_id);
    const targetTournamentStatus = statuses.get(match.tournament_id);

    if (!currentTournamentStatus || !targetTournamentStatus) {
      throw new DomainError('TOURNAMENT_NOT_FOUND', 'Tournament not found');
    }

    validateMatchEditable(
      current,
      match,
      currentTournamentStatus,
      targetTournamentStatus
    );

    const result = await client.query<Match>(
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

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteMatch = async (id: number): Promise<boolean> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query<Match & { tournament_status: TournamentStatus }>(
      `SELECT match_row.id, match_row.tournament_id,
              match_row.home_team_id, match_row.away_team_id,
              match_row.match_date, match_row.location, match_row.round,
              match_row.home_goals, match_row.away_goals,
              match_row.home_penalties, match_row.away_penalties,
              match_row.winner_team_id, match_row.status, match_row.created_at,
              tournament.status AS tournament_status
       FROM matches match_row
       JOIN tournaments tournament ON tournament.id = match_row.tournament_id
       WHERE match_row.id = $1
       FOR UPDATE OF match_row, tournament`,
      [id]
    );
    const current = currentResult.rows[0];

    if (!current) {
      await client.query('ROLLBACK');
      return false;
    }

    validateMatchDeletable(current.status, current.tournament_status);

    const result = await client.query('DELETE FROM matches WHERE id = $1 RETURNING id', [id]);
    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

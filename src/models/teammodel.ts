import pool from '../config/db';
import {
  DomainError,
  PLAYER_LIMITS,
  TournamentModality
} from '../domain/competitionRules';

export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  players_count: number;
  created_at: Date;
}

export interface TeamInput {
  tournament_id: number;
  name: string;
  players_count: number;
}

interface RegistrationTournament {
  modality: TournamentModality;
  max_teams: number;
  status: string;
}

const teamSelect = 'id, tournament_id, name, players_count, created_at';

const validateRegistration = (
  tournament: RegistrationTournament,
  playersCount: number
): void => {
  if (tournament.status !== 'open') {
    throw new DomainError(
      'TOURNAMENT_REGISTRATION_CLOSED',
      'Teams can only be registered or edited while the tournament is open'
    );
  }

  const limits = PLAYER_LIMITS[tournament.modality];
  if (!limits) {
    throw new DomainError(
      'UNSUPPORTED_TOURNAMENT_MODALITY',
      'The tournament modality is not supported and must be migrated'
    );
  }
  if (playersCount < limits.min || playersCount > limits.max) {
    throw new DomainError(
      'INVALID_PLAYERS_COUNT_FOR_MODALITY',
      `players_count must be between ${limits.min} and ${limits.max} for ${tournament.modality}`
    );
  }
};

export const getAllTeams = async (): Promise<Team[]> => {
  const result = await pool.query(
    `SELECT ${teamSelect}
     FROM teams
     ORDER BY id ASC`
  );
  return result.rows;
};

export const getTeamById = async (id: number): Promise<Team | null> => {
  const result = await pool.query(
    `SELECT ${teamSelect}
     FROM teams
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
};

export const createTeam = async (team: TeamInput): Promise<Team> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query<RegistrationTournament>(
      `SELECT modality, max_teams, status
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [team.tournament_id]
    );
    const tournament = tournamentResult.rows[0];

    if (!tournament) {
      throw new DomainError('TOURNAMENT_NOT_FOUND', 'The tournament_id does not exist');
    }

    validateRegistration(tournament, team.players_count);

    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM teams WHERE tournament_id = $1',
      [team.tournament_id]
    );
    if (Number(countResult.rows[0]?.count ?? 0) >= tournament.max_teams) {
      throw new DomainError(
        'TOURNAMENT_CAPACITY_REACHED',
        `The tournament already has its maximum of ${tournament.max_teams} teams`
      );
    }

    const result = await client.query<Team>(
      `INSERT INTO teams (tournament_id, name, players_count)
       VALUES ($1, $2, $3)
       RETURNING ${teamSelect}`,
      [team.tournament_id, team.name, team.players_count]
    );

    await client.query('COMMIT');
    return result.rows[0]!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateTeam = async (id: number, team: TeamInput): Promise<Team | null> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const currentResult = await client.query<Team>(
      `SELECT ${teamSelect}
       FROM teams
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];

    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    if (current.tournament_id !== team.tournament_id) {
      const matchResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM matches
         WHERE home_team_id = $1 OR away_team_id = $1 OR winner_team_id = $1`,
        [id]
      );
      if (Number(matchResult.rows[0]?.count ?? 0) > 0) {
        throw new DomainError(
          'TEAM_HAS_MATCHES',
          'A team with registered matches cannot be moved to another tournament'
        );
      }
    }

    const tournamentResult = await client.query<RegistrationTournament>(
      `SELECT modality, max_teams, status
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [team.tournament_id]
    );
    const tournament = tournamentResult.rows[0];

    if (!tournament) {
      throw new DomainError('TOURNAMENT_NOT_FOUND', 'The tournament_id does not exist');
    }

    validateRegistration(tournament, team.players_count);

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM teams
       WHERE tournament_id = $1 AND id <> $2`,
      [team.tournament_id, id]
    );
    if (Number(countResult.rows[0]?.count ?? 0) >= tournament.max_teams) {
      throw new DomainError(
        'TOURNAMENT_CAPACITY_REACHED',
        `The tournament already has its maximum of ${tournament.max_teams} teams`
      );
    }

    const result = await client.query<Team>(
      `UPDATE teams
       SET tournament_id = $1, name = $2, players_count = $3
       WHERE id = $4
       RETURNING ${teamSelect}`,
      [team.tournament_id, team.name, team.players_count, id]
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

export const deleteTeam = async (id: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING id', [id]);
  return (result.rowCount ?? 0) > 0;
};

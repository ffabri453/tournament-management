import pool from '../config/db';
import {
  DomainError,
  PLAYER_LIMITS,
  RULES_BY_MODALITY,
  TournamentCapacity,
  TournamentLocation,
  TournamentModality,
  TournamentStatus
} from '../domain/competitionRules';

export interface Tournament {
  id: number;
  name: string;
  location: TournamentLocation;
  rules: string;
  format: 'knockout';
  modality: TournamentModality;
  max_teams: TournamentCapacity;
  status: TournamentStatus;
  created_at: Date;
}

export interface CreateTournamentInput {
  name: string;
  location: TournamentLocation;
  format: 'knockout';
  modality: TournamentModality;
  max_teams: TournamentCapacity;
  status: TournamentStatus;
}

export type UpdateTournamentInput = Partial<CreateTournamentInput>;

const tournamentColumns: Record<keyof UpdateTournamentInput, string> = {
  name: 'name',
  location: 'location',
  format: 'format',
  modality: 'modality',
  max_teams: 'max_teams',
  status: 'status'
};

const tournamentSelect = `
  id, name, location, rules, format, modality, max_teams, status, created_at
`;

export const getAllTournaments = async (): Promise<Tournament[]> => {
  const result = await pool.query(
    `SELECT ${tournamentSelect}
     FROM tournaments
     ORDER BY id ASC`
  );

  return result.rows;
};

export const getTournamentById = async (id: number): Promise<Tournament | null> => {
  const result = await pool.query(
    `SELECT ${tournamentSelect}
     FROM tournaments
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
};

export const createTournament = async (tournament: CreateTournamentInput): Promise<Tournament> => {
  const result = await pool.query(
    `INSERT INTO tournaments (name, location, rules, format, modality, max_teams, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${tournamentSelect}`,
    [
      tournament.name,
      tournament.location,
      RULES_BY_MODALITY[tournament.modality],
      tournament.format,
      tournament.modality,
      tournament.max_teams,
      tournament.status
    ]
  );

  return result.rows[0];
};

export const updateTournament = async (
  id: number,
  tournament: UpdateTournamentInput
): Promise<Tournament | null> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query<Tournament>(
      `SELECT ${tournamentSelect}
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];

    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }

    const targetModality = tournament.modality ?? current.modality;
    const targetCapacity = tournament.max_teams ?? current.max_teams;
    const limits = PLAYER_LIMITS[targetModality];

    if (!limits) {
      throw new DomainError(
        'UNSUPPORTED_TOURNAMENT_MODALITY',
        'The existing tournament modality must be migrated before it can be updated'
      );
    }

    const teamSummary = await client.query<{
      count: string;
      min_players: number | null;
      max_players: number | null;
    }>(
      `SELECT COUNT(*)::text AS count,
              MIN(players_count) AS min_players,
              MAX(players_count) AS max_players
       FROM teams
       WHERE tournament_id = $1`,
      [id]
    );
    const summary = teamSummary.rows[0];
    const teamCount = Number(summary?.count ?? 0);

    if (teamCount > targetCapacity) {
      throw new DomainError(
        'TOURNAMENT_CAPACITY_TOO_SMALL',
        `max_teams cannot be lower than the ${teamCount} registered teams`
      );
    }

    const hasTooFewPlayers = summary?.min_players !== null &&
      summary?.min_players !== undefined &&
      summary.min_players < limits.min;
    const hasTooManyPlayers = summary?.max_players !== null &&
      summary?.max_players !== undefined &&
      summary.max_players > limits.max;

    if (hasTooFewPlayers || hasTooManyPlayers) {
      throw new DomainError(
        'TOURNAMENT_MODALITY_INCOMPATIBLE',
        `Existing teams must have between ${limits.min} and ${limits.max} players for ${targetModality}`
      );
    }

    const valuesToUpdate: Record<string, string | number> = { ...tournament };
    if (tournament.modality) {
      valuesToUpdate.rules = RULES_BY_MODALITY[tournament.modality];
    }

    const entries = Object.entries(valuesToUpdate);
    const columns = { ...tournamentColumns, rules: 'rules' } as Record<string, string>;
    const setClause = entries
      .map(([field], index) => `${columns[field]} = $${index + 2}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const result = await client.query<Tournament>(
      `UPDATE tournaments
       SET ${setClause}
       WHERE id = $1
       RETURNING ${tournamentSelect}`,
      [id, ...values]
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

export const deleteTournament = async (id: number): Promise<Tournament | null> => {
  const result = await pool.query(
    `DELETE FROM tournaments
     WHERE id = $1
     RETURNING ${tournamentSelect}`,
    [id]
  );

  return result.rows[0] ?? null;
};

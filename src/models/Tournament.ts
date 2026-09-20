import pool from '../config/db';
import {
  DomainError,
  INITIAL_ROUND_BY_CAPACITY,
  PLAYER_LIMITS,
  RULES_BY_MODALITY,
  TOURNAMENT_CAPACITIES,
  TOURNAMENT_LOCATIONS,
  TOURNAMENT_MODALITIES,
  MatchRound,
  TournamentCapacity,
  TournamentLocation,
  TournamentModality,
  TournamentStatus,
  isNonNumericName,
  isPositiveInteger
} from '../domain/competitionRules';
import { Match, MatchInput, createMatch } from './Match';
import { Team } from './teammodel';

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

export interface StartTournamentInput {
  match_date: Date;
}

export interface StartTournamentResult {
  tournament: Tournament;
  matches: Match[];
}

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

const teamSelect = 'id, tournament_id, name, players_count, created_at';

export const getInitialRound = (capacity: number): MatchRound => {
  if (!TOURNAMENT_CAPACITIES.includes(capacity as TournamentCapacity)) {
    throw new DomainError(
      'UNSUPPORTED_TOURNAMENT_CAPACITY',
      `Tournament capacity must be one of: ${TOURNAMENT_CAPACITIES.join(', ')}`
    );
  }

  return INITIAL_ROUND_BY_CAPACITY[capacity as TournamentCapacity];
};

export const validateTournamentReady = (
  tournament: Tournament,
  teams: Team[]
): void => {
  if (tournament.status !== 'open') {
    throw new DomainError(
      'TOURNAMENT_NOT_OPEN',
      `Tournament cannot start from status ${tournament.status}`
    );
  }

  if (
    !isNonNumericName(tournament.name) ||
    !TOURNAMENT_LOCATIONS.includes(tournament.location) ||
    tournament.format !== 'knockout' ||
    !TOURNAMENT_MODALITIES.includes(tournament.modality) ||
    RULES_BY_MODALITY[tournament.modality] !== tournament.rules
  ) {
    throw new DomainError(
      'INVALID_TOURNAMENT_CONFIGURATION',
      'Tournament configuration is not valid for starting'
    );
  }

  getInitialRound(tournament.max_teams);

  if (teams.length !== tournament.max_teams) {
    throw new DomainError(
      'TOURNAMENT_TEAM_COUNT_MISMATCH',
      `Tournament requires exactly ${tournament.max_teams} teams and has ${teams.length}`
    );
  }

  const limits = PLAYER_LIMITS[tournament.modality];
  const teamIds = new Set<number>();
  const teamNames = new Set<string>();

  for (const team of teams) {
    const normalizedName = team.name.trim().toLowerCase();
    const isValidTeam =
      isPositiveInteger(team.id) &&
      team.tournament_id === tournament.id &&
      isNonNumericName(team.name) &&
      Number.isInteger(team.players_count) &&
      team.players_count >= limits.min &&
      team.players_count <= limits.max;

    if (!isValidTeam) {
      throw new DomainError(
        'INVALID_TOURNAMENT_TEAM',
        `Team ${team.id} is not valid for this tournament`
      );
    }

    if (teamIds.has(team.id) || teamNames.has(normalizedName)) {
      throw new DomainError(
        'DUPLICATE_TOURNAMENT_TEAM',
        'Tournament teams must be unique'
      );
    }

    teamIds.add(team.id);
    teamNames.add(normalizedName);
  }
};

export const generateInitialMatches = (
  tournament: Tournament,
  teams: Team[],
  matchDate: Date
): MatchInput[] => {
  validateTournamentReady(tournament, teams);
  const initialRound = getInitialRound(tournament.max_teams);
  const matches: MatchInput[] = [];

  for (let index = 0; index < teams.length; index += 2) {
    const homeTeam = teams[index];
    const awayTeam = teams[index + 1];

    if (!homeTeam || !awayTeam || homeTeam.id === awayTeam.id) {
      throw new DomainError(
        'INVALID_INITIAL_PAIRING',
        'Every initial match must contain two different teams'
      );
    }

    matches.push({
      tournament_id: tournament.id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      match_date: matchDate,
      location: tournament.location,
      round: initialRound,
      home_goals: null,
      away_goals: null,
      home_penalties: null,
      away_penalties: null,
      winner_team_id: null,
      status: 'scheduled'
    });
  }

  return matches;
};

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

export const startTournament = async (
  id: number,
  input: StartTournamentInput
): Promise<StartTournamentResult> => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    // El bloqueo serializa dos intentos simultáneos de iniciar el mismo torneo.
    const tournamentResult = await client.query<Tournament>(
      `SELECT ${tournamentSelect}
       FROM tournaments
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    const tournament = tournamentResult.rows[0];

    if (!tournament) {
      throw new DomainError('TOURNAMENT_NOT_FOUND', 'Tournament not found');
    }

    const teamsResult = await client.query<Team>(
      `SELECT ${teamSelect}
       FROM teams
       WHERE tournament_id = $1
       ORDER BY id ASC`,
      [id]
    );

    validateTournamentReady(tournament, teamsResult.rows);

    const existingMatchesResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM matches
         WHERE tournament_id = $1
       ) AS exists`,
      [id]
    );

    if (existingMatchesResult.rows[0]?.exists) {
      throw new DomainError(
        'TOURNAMENT_MATCHES_ALREADY_EXIST',
        'Tournament already has registered matches'
      );
    }

    const initialMatches = generateInitialMatches(
      tournament,
      teamsResult.rows,
      input.match_date
    );
    const expectedMatches = teamsResult.rows.length / 2;
    const createdMatches: Match[] = [];

    // Todas las inserciones usan el mismo cliente para que el rollback sea completo.
    for (const match of initialMatches) {
      createdMatches.push(await createMatch(match, client));
    }

    if (createdMatches.length !== expectedMatches) {
      throw new DomainError(
        'INITIAL_MATCH_COUNT_MISMATCH',
        `Expected ${expectedMatches} initial matches but created ${createdMatches.length}`
      );
    }

    const updatedTournamentResult = await client.query<Tournament>(
      `UPDATE tournaments
       SET status = 'in_progress'
       WHERE id = $1 AND status = 'open'
       RETURNING ${tournamentSelect}`,
      [id]
    );
    const updatedTournament = updatedTournamentResult.rows[0];

    if (!updatedTournament) {
      throw new DomainError(
        'TOURNAMENT_STATUS_UPDATE_FAILED',
        'Tournament status could not be updated'
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    return {
      tournament: updatedTournament,
      matches: createdMatches
    };
  } catch (error) {
    if (transactionStarted) {
      // Si cualquier validación o inserción falla, no queda un cuadro parcial.
      await client.query('ROLLBACK');
    }
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

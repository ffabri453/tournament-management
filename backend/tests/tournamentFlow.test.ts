import assert from 'node:assert/strict';
import test from 'node:test';
import { PoolClient } from 'pg';
import pool from '../src/config/db';
import {
  DomainError,
  MatchRound,
  TournamentCapacity,
  TournamentStatus
} from '../src/domain/competitionRules';
import { Match } from '../src/models/Match';
import { Team } from '../src/models/teammodel';
import {
  Tournament,
  generateInitialMatches,
  getInitialRound,
  startTournament,
  validateTournamentReady
} from '../src/models/Tournament';
import { validateStartTournamentBody } from '../src/controllers/tournamentController';

const futureMatchDate = new Date('2099-01-10T20:00:00-03:00');

const createTournamentFixture = (
  maxTeams: TournamentCapacity,
  status: TournamentStatus = 'open'
): Tournament => ({
  id: 1,
  name: 'Copa Regional',
  location: 'Firmat',
  rules: 'official_rules_football_7',
  format: 'knockout',
  modality: 'futbol_7',
  max_teams: maxTeams,
  status,
  champion_team_id: null,
  created_at: new Date('2026-01-01T00:00:00Z')
});

const createTeamFixtures = (count: number, tournamentId = 1): Team[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    tournament_id: tournamentId,
    name: `Team ${index + 1}`,
    players_count: 10,
    created_at: new Date('2026-01-01T00:00:00Z')
  }));
};

class FakeTournamentClient {
  public readonly commands: string[] = [];
  public readonly matches: Match[];
  public released = false;
  public failOnInsert: number | null = null;

  private stagedMatches: Match[] = [];
  private stagedTournament: Tournament | null = null;
  private insertCount = 0;

  constructor(
    public tournament: Tournament | null,
    public readonly teams: Team[],
    existingMatches: Match[] = []
  ) {
    this.matches = [...existingMatches];
  }

  public async query(queryText: string, values: unknown[] = []): Promise<unknown> {
    const sql = queryText.replace(/\s+/g, ' ').trim();
    this.commands.push(sql);

    if (sql === 'BEGIN') {
      return this.result([]);
    }

    if (sql === 'COMMIT') {
      if (this.stagedTournament) this.tournament = this.stagedTournament;
      this.matches.push(...this.stagedMatches);
      this.stagedTournament = null;
      this.stagedMatches = [];
      return this.result([]);
    }

    if (sql === 'ROLLBACK') {
      this.stagedTournament = null;
      this.stagedMatches = [];
      return this.result([]);
    }

    if (sql.includes('FROM tournaments') && sql.includes('FOR UPDATE')) {
      const requestedId = values[0];
      return this.result(
        this.tournament && this.tournament.id === requestedId ? [this.tournament] : []
      );
    }

    if (sql.includes('FROM teams') && sql.includes('ORDER BY id ASC')) {
      const tournamentId = values[0];
      return this.result(this.teams.filter((team) => team.tournament_id === tournamentId));
    }

    if (sql.startsWith('SELECT EXISTS') && sql.includes('FROM matches')) {
      return this.result([{ exists: this.matches.length > 0 }]);
    }

    if (sql.startsWith('INSERT INTO matches')) {
      this.insertCount += 1;
      if (this.failOnInsert === this.insertCount) {
        throw new Error('Simulated match insertion failure');
      }

      const match: Match = {
        id: this.matches.length + this.stagedMatches.length + 1,
        tournament_id: values[0] as number,
        home_team_id: values[1] as number,
        away_team_id: values[2] as number,
        match_date: values[3] as Date,
        location: values[4] as string,
        round: values[5] as MatchRound,
        home_goals: values[6] as number | null,
        away_goals: values[7] as number | null,
        home_penalties: values[8] as number | null,
        away_penalties: values[9] as number | null,
        winner_team_id: values[10] as number | null,
        status: 'scheduled',
        created_at: new Date('2026-01-01T00:00:00Z')
      };
      this.stagedMatches.push(match);
      return this.result([match]);
    }

    if (sql.startsWith('UPDATE tournaments') && sql.includes("SET status = 'in_progress'")) {
      if (!this.tournament || this.tournament.status !== 'open') return this.result([]);
      this.stagedTournament = { ...this.tournament, status: 'in_progress' };
      return this.result([this.stagedTournament]);
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  }

  public release(): void {
    this.released = true;
  }

  private result<T>(rows: T[]): object {
    return {
      command: '',
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows
    };
  }
}

const withFakeClient = async <T>(
  client: FakeTournamentClient,
  action: () => Promise<T>
): Promise<T> => {
  const originalConnect = pool.connect;
  pool.connect = (async () => client as unknown as PoolClient) as typeof pool.connect;

  try {
    return await action();
  } finally {
    pool.connect = originalConnect;
  }
};

for (const [capacity, round] of [
  [4, 'semi_final'],
  [8, 'quarter_final'],
  [16, 'round_of_16'],
  [32, 'round_of_32']
] as const) {
  test(`${capacity} teams generate ${capacity / 2} ${round} matches`, () => {
    const tournament = createTournamentFixture(capacity);
    const teams = createTeamFixtures(capacity);
    const matches = generateInitialMatches(tournament, teams, futureMatchDate);

    assert.equal(getInitialRound(capacity), round);
    assert.equal(matches.length, capacity / 2);
    assert.ok(matches.every((match) => match.round === round));
    assert.ok(matches.every((match) => match.tournament_id === tournament.id));
    assert.ok(matches.every((match) => match.home_team_id !== match.away_team_id));

    const participantIds = matches.flatMap((match) => [
      match.home_team_id,
      match.away_team_id
    ]);
    assert.equal(new Set(participantIds).size, capacity);
    assert.deepEqual(participantIds, teams.map((team) => team.id));
  });
}

test('start body requires one future match date', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.ok(validateStartTournamentBody({ match_date: '2099-01-10 20:00' }, now).data);
  assert.equal(validateStartTournamentBody({}, now).data, undefined);
  assert.equal(
    validateStartTournamentBody({ match_date: '2025-01-10 20:00' }, now).data,
    undefined
  );
  assert.equal(
    validateStartTournamentBody({ match_date: '2099-01-10 20:00', round: 'final' }, now).data,
    undefined
  );
});

test('tournament requires exactly its configured team capacity', () => {
  const tournament = createTournamentFixture(8);

  assert.throws(
    () => validateTournamentReady(tournament, createTeamFixtures(6)),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_TEAM_COUNT_MISMATCH'
  );
  assert.throws(
    () => validateTournamentReady(tournament, createTeamFixtures(9)),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_TEAM_COUNT_MISMATCH'
  );
});

test('tournament only starts from open', () => {
  for (const status of ['in_progress', 'finished'] as const) {
    assert.throws(
      () => validateTournamentReady(createTournamentFixture(4, status), createTeamFixtures(4)),
      (error: unknown) => error instanceof DomainError && error.code === 'TOURNAMENT_NOT_OPEN'
    );
  }
});

test('unsupported capacity and invalid teams are rejected', () => {
  const unsupported = {
    ...createTournamentFixture(4),
    max_teams: 6 as TournamentCapacity
  };
  assert.throws(
    () => validateTournamentReady(unsupported, createTeamFixtures(6)),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'UNSUPPORTED_TOURNAMENT_CAPACITY'
  );

  const invalidTeams = createTeamFixtures(4);
  const firstInvalidTeam = invalidTeams[0]!;
  invalidTeams[0] = { ...firstInvalidTeam, players_count: 2 };
  assert.throws(
    () => validateTournamentReady(createTournamentFixture(4), invalidTeams),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_TOURNAMENT_TEAM'
  );
});

test('duplicate or foreign teams are rejected', () => {
  const duplicateTeams = createTeamFixtures(4);
  const firstDuplicateTeam = duplicateTeams[0]!;
  const secondDuplicateTeam = duplicateTeams[1]!;
  duplicateTeams[1] = { ...secondDuplicateTeam, id: firstDuplicateTeam.id };
  assert.throws(
    () => validateTournamentReady(createTournamentFixture(4), duplicateTeams),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'DUPLICATE_TOURNAMENT_TEAM'
  );

  const foreignTeams = createTeamFixtures(4);
  const foreignTeam = foreignTeams[2]!;
  foreignTeams[2] = { ...foreignTeam, tournament_id: 99 };
  assert.throws(
    () => validateTournamentReady(createTournamentFixture(4), foreignTeams),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_TOURNAMENT_TEAM'
  );
});

test('successful start commits matches and changes status', async () => {
  const client = new FakeTournamentClient(
    createTournamentFixture(4),
    createTeamFixtures(4)
  );

  const result = await withFakeClient(client, () => startTournament(1, {
    match_date: futureMatchDate
  }));

  assert.equal(result.matches.length, 2);
  assert.equal(result.tournament.status, 'in_progress');
  assert.equal(client.matches.length, 2);
  assert.equal(client.tournament?.status, 'in_progress');
  assert.ok(client.commands.includes('COMMIT'));
  assert.ok(!client.commands.includes('ROLLBACK'));
  assert.ok(client.released);
});

test('missing tournament returns its domain error and rolls back', async () => {
  const client = new FakeTournamentClient(null, []);

  await assert.rejects(
    withFakeClient(client, () => startTournament(999, { match_date: futureMatchDate })),
    (error: unknown) => error instanceof DomainError && error.code === 'TOURNAMENT_NOT_FOUND'
  );
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(client.released);
});

test('existing matches prevent bracket duplication', async () => {
  const existingMatch = generateInitialMatches(
    createTournamentFixture(4),
    createTeamFixtures(4),
    futureMatchDate
  )[0]!;
  const client = new FakeTournamentClient(
    createTournamentFixture(4),
    createTeamFixtures(4),
    [{ ...existingMatch, id: 1, created_at: new Date() }]
  );

  await assert.rejects(
    withFakeClient(client, () => startTournament(1, { match_date: futureMatchDate })),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_MATCHES_ALREADY_EXIST'
  );
  assert.equal(client.matches.length, 1);
  assert.equal(client.tournament?.status, 'open');
  assert.ok(client.commands.includes('ROLLBACK'));
});

test('calling start twice does not create duplicate matches', async () => {
  const client = new FakeTournamentClient(
    createTournamentFixture(4),
    createTeamFixtures(4)
  );

  await withFakeClient(client, () => startTournament(1, { match_date: futureMatchDate }));
  await assert.rejects(
    withFakeClient(client, () => startTournament(1, { match_date: futureMatchDate })),
    (error: unknown) => error instanceof DomainError && error.code === 'TOURNAMENT_NOT_OPEN'
  );
  assert.equal(client.matches.length, 2);
});

test('match insertion failure rolls back every change', async () => {
  const client = new FakeTournamentClient(
    createTournamentFixture(8),
    createTeamFixtures(8)
  );
  client.failOnInsert = 3;

  await assert.rejects(
    withFakeClient(client, () => startTournament(1, { match_date: futureMatchDate })),
    /Simulated match insertion failure/
  );
  assert.equal(client.matches.length, 0);
  assert.equal(client.tournament?.status, 'open');
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(!client.commands.includes('COMMIT'));
  assert.ok(client.released);
});

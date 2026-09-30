import assert from 'node:assert/strict';
import test from 'node:test';
import { PoolClient } from 'pg';
import pool from '../src/config/db';
import {
  DomainError,
  MatchRound,
  TournamentCapacity,
  TournamentStatus,
  getNextRound
} from '../src/domain/competitionRules';
import { Match } from '../src/models/Match';
import {
  Tournament,
  advanceTournamentRound,
  generateNextRoundMatches,
  validateRoundProgression
} from '../src/models/Tournament';
import { validateStartTournamentBody } from '../src/controllers/tournamentController';

const nextRoundDate = new Date('2099-01-17T20:00:00-03:00');

const createTournamentFixture = (
  maxTeams: TournamentCapacity,
  status: TournamentStatus = 'in_progress'
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

const createFinishedRound = (
  tournamentId: number,
  round: MatchRound,
  matchCount: number,
  firstTeamId = 1
): Match[] => Array.from({ length: matchCount }, (_, index) => {
  const homeTeamId = firstTeamId + index * 2;
  const awayTeamId = homeTeamId + 1;
  return {
    id: index + 1,
    tournament_id: tournamentId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    match_date: new Date('2026-01-02T00:00:00Z'),
    location: 'Firmat',
    round,
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    winner_team_id: homeTeamId,
    status: 'finished',
    created_at: new Date('2026-01-01T00:00:00Z')
  };
});

class FakeNextRoundClient {
  public readonly commands: string[] = [];
  public readonly matches: Match[];
  public released = false;
  public failOnInsert: number | null = null;

  private stagedMatches: Match[] = [];
  private insertCount = 0;

  constructor(public tournament: Tournament | null, matches: Match[]) {
    this.matches = [...matches];
  }

  public async query(queryText: string, values: unknown[] = []): Promise<unknown> {
    const sql = queryText.replace(/\s+/g, ' ').trim();
    this.commands.push(sql);

    if (sql === 'BEGIN') return this.result([]);

    if (sql === 'COMMIT') {
      this.matches.push(...this.stagedMatches);
      this.stagedMatches = [];
      return this.result([]);
    }

    if (sql === 'ROLLBACK') {
      this.stagedMatches = [];
      return this.result([]);
    }

    if (sql.includes('FROM tournaments') && sql.includes('FOR UPDATE')) {
      return this.result(
        this.tournament && this.tournament.id === values[0] ? [this.tournament] : []
      );
    }

    if (sql.includes('FROM matches') && sql.includes('ORDER BY id ASC')) {
      return this.result(
        this.matches
          .filter((match) => match.tournament_id === values[0])
          .sort((left, right) => left.id - right.id)
      );
    }

    if (sql.startsWith('INSERT INTO matches')) {
      this.insertCount += 1;
      if (this.failOnInsert === this.insertCount) {
        throw new Error('Simulated next-round insertion failure');
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
        status: values[11] as Match['status'],
        created_at: new Date('2026-01-01T00:00:00Z')
      };
      this.stagedMatches.push(match);
      return this.result([match]);
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  }

  public release(): void {
    this.released = true;
  }

  private result<T>(rows: T[]): object {
    return { command: '', rowCount: rows.length, oid: 0, fields: [], rows };
  }
}

const withFakeClient = async <T>(
  client: FakeNextRoundClient,
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

for (const [capacity, currentRound, nextRound, currentMatches, nextMatches] of [
  [4, 'semi_final', 'final', 2, 1],
  [8, 'quarter_final', 'semi_final', 4, 2],
  [16, 'round_of_16', 'quarter_final', 8, 4],
  [32, 'round_of_32', 'round_of_16', 16, 8]
] as const) {
  test(`${capacity} teams advance from ${currentRound} to ${nextRound}`, () => {
    const tournament = createTournamentFixture(capacity);
    const matches = createFinishedRound(tournament.id, currentRound, currentMatches);
    const progression = validateRoundProgression(tournament, matches);
    const generated = generateNextRoundMatches(
      tournament,
      progression.roundWinners,
      progression.nextRound,
      nextRoundDate
    );

    assert.equal(getNextRound(currentRound), nextRound);
    assert.equal(progression.currentRound, currentRound);
    assert.equal(progression.nextRound, nextRound);
    assert.equal(generated.length, nextMatches);
  });
}

test('next-round body reuses strict future match date validation', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.ok(validateStartTournamentBody({ match_date: '2099-01-17 20:00' }, now).data);
  assert.equal(validateStartTournamentBody({}, now).data, undefined);
  assert.equal(validateStartTournamentBody({ match_date: 'invalid' }, now).data, undefined);
  assert.equal(validateStartTournamentBody({ match_date: '2025-01-01 20:00' }, now).data, undefined);
  assert.equal(
    validateStartTournamentBody({ match_date: '2099-01-17 20:00', round: 'final' }, now).data,
    undefined
  );
});

test('winner order defines pairings and generated fields match start', () => {
  const tournament = createTournamentFixture(8);
  const matches = createFinishedRound(1, 'quarter_final', 4);
  matches[0]!.winner_team_id = 1;
  matches[1]!.winner_team_id = 4;
  matches[2]!.winner_team_id = 6;
  matches[3]!.winner_team_id = 7;

  const progression = validateRoundProgression(tournament, matches);
  const generated = generateNextRoundMatches(
    tournament,
    progression.roundWinners,
    progression.nextRound,
    nextRoundDate
  );

  assert.deepEqual(progression.roundWinners, [1, 4, 6, 7]);
  assert.deepEqual(
    generated.map((match) => [match.home_team_id, match.away_team_id]),
    [[1, 4], [6, 7]]
  );
  assert.ok(generated.every((match) => match.tournament_id === 1));
  assert.ok(generated.every((match) => match.round === 'semi_final'));
  assert.ok(generated.every((match) => match.location === 'Firmat'));
  assert.ok(generated.every((match) => match.match_date === nextRoundDate));
  assert.ok(generated.every((match) => match.status === 'scheduled'));
  assert.ok(generated.every((match) => match.home_team_id !== match.away_team_id));
  assert.ok(generated.every((match) =>
    match.home_goals === null &&
    match.away_goals === null &&
    match.home_penalties === null &&
    match.away_penalties === null &&
    match.winner_team_id === null
  ));
});

test('open and finished tournaments cannot advance', () => {
  for (const status of ['open', 'finished'] as const) {
    assert.throws(
      () => validateRoundProgression(
        createTournamentFixture(4, status),
        createFinishedRound(1, 'semi_final', 2)
      ),
      (error: unknown) => error instanceof DomainError &&
        error.code === 'TOURNAMENT_NOT_IN_PROGRESS'
    );
  }
});

test('an in-progress tournament without matches cannot advance', () => {
  assert.throws(
    () => validateRoundProgression(createTournamentFixture(4), []),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_MATCHES_NOT_FOUND'
  );
});

test('an unfinished match prevents the whole round from advancing', () => {
  const matches = createFinishedRound(1, 'quarter_final', 4);
  matches[2] = {
    ...matches[2]!,
    status: 'scheduled',
    home_goals: null,
    away_goals: null,
    winner_team_id: null
  };

  assert.throws(
    () => validateRoundProgression(createTournamentFixture(8), matches),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'CURRENT_ROUND_INCOMPLETE'
  );
});

test('a finished match without winner prevents advancement', () => {
  const matches = createFinishedRound(1, 'semi_final', 2);
  matches[0] = { ...matches[0]!, winner_team_id: null };

  assert.throws(
    () => validateRoundProgression(createTournamentFixture(4), matches),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'CURRENT_ROUND_INCOMPLETE'
  );
});

test('winner must be one of the match participants', () => {
  const matches = createFinishedRound(1, 'semi_final', 2);
  matches[0] = { ...matches[0]!, winner_team_id: 99 };

  assert.throws(
    () => validateRoundProgression(createTournamentFixture(4), matches),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_MATCH_WINNER'
  );
});

test('the same winner cannot appear twice in a round', () => {
  const matches = createFinishedRound(1, 'semi_final', 2);
  matches[1] = { ...matches[1]!, home_team_id: 1, winner_team_id: 1 };

  assert.throws(
    () => validateRoundProgression(createTournamentFixture(4), matches),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'DUPLICATE_ROUND_WINNER'
  );
});

test('skipped or partial rounds are rejected as incoherent', () => {
  const quarterFinals = createFinishedRound(1, 'quarter_final', 4);
  const final = createFinishedRound(1, 'final', 1, 20).map((match) => ({ ...match, id: 5 }));
  assert.throws(
    () => validateRoundProgression(createTournamentFixture(8), [...quarterFinals, ...final]),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'INCOHERENT_TOURNAMENT_BRACKET'
  );

  assert.throws(
    () => validateRoundProgression(
      createTournamentFixture(8),
      createFinishedRound(1, 'quarter_final', 3)
    ),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'ROUND_MATCH_COUNT_MISMATCH'
  );
});

test('the final cannot advance or finish the tournament', () => {
  const tournament = createTournamentFixture(4);
  const semiFinals = createFinishedRound(1, 'semi_final', 2);
  const final = createFinishedRound(1, 'final', 1, 10).map((match) => ({ ...match, id: 3 }));

  assert.throws(
    () => validateRoundProgression(tournament, [...semiFinals, ...final]),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_ALREADY_AT_FINAL'
  );
  assert.equal(tournament.status, 'in_progress');
});

test('successful advancement commits only the next round', async () => {
  const client = new FakeNextRoundClient(
    createTournamentFixture(8),
    createFinishedRound(1, 'quarter_final', 4)
  );

  const result = await withFakeClient(client, () => advanceTournamentRound(1, {
    match_date: nextRoundDate
  }));

  assert.equal(result.current_round, 'quarter_final');
  assert.equal(result.next_round, 'semi_final');
  assert.equal(result.matches.length, 2);
  assert.equal(client.matches.length, 6);
  assert.equal(client.tournament?.status, 'in_progress');
  assert.ok(client.commands.some((sql) => sql.includes('FOR UPDATE')));
  assert.ok(client.commands.includes('COMMIT'));
  assert.ok(!client.commands.some((sql) => sql.startsWith('UPDATE tournaments')));
  assert.ok(client.released);
});

test('eight-team flow advances round by round and stops at the final', async () => {
  const client = new FakeNextRoundClient(
    createTournamentFixture(8),
    createFinishedRound(1, 'quarter_final', 4)
  );

  const semiFinalResult = await withFakeClient(client, () => advanceTournamentRound(1, {
    match_date: nextRoundDate
  }));
  assert.equal(semiFinalResult.next_round, 'semi_final');
  assert.equal(semiFinalResult.matches.length, 2);

  for (const match of client.matches.filter((item) => item.round === 'semi_final')) {
    match.status = 'finished';
    match.home_goals = 1;
    match.away_goals = 0;
    match.winner_team_id = match.home_team_id;
  }

  const finalResult = await withFakeClient(client, () => advanceTournamentRound(1, {
    match_date: new Date('2099-01-24T20:00:00-03:00')
  }));
  assert.equal(finalResult.next_round, 'final');
  assert.equal(finalResult.matches.length, 1);
  assert.equal(client.matches.filter((match) => match.round === 'quarter_final').length, 4);
  assert.equal(client.matches.filter((match) => match.round === 'semi_final').length, 2);
  assert.equal(client.matches.filter((match) => match.round === 'final').length, 1);
  assert.equal(client.tournament?.status, 'in_progress');

  await assert.rejects(
    withFakeClient(client, () => advanceTournamentRound(1, {
      match_date: new Date('2099-01-31T20:00:00-03:00')
    })),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_ALREADY_AT_FINAL'
  );
  assert.equal(client.matches.filter((match) => match.round === 'final').length, 1);
});

test('missing tournament rolls back with a not-found domain error', async () => {
  const client = new FakeNextRoundClient(null, []);

  await assert.rejects(
    withFakeClient(client, () => advanceTournamentRound(999, { match_date: nextRoundDate })),
    (error: unknown) => error instanceof DomainError && error.code === 'TOURNAMENT_NOT_FOUND'
  );
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(client.released);
});

test('insertion failure rolls back the entire next round', async () => {
  const client = new FakeNextRoundClient(
    createTournamentFixture(8),
    createFinishedRound(1, 'quarter_final', 4)
  );
  client.failOnInsert = 2;

  await assert.rejects(
    withFakeClient(client, () => advanceTournamentRound(1, { match_date: nextRoundDate })),
    /Simulated next-round insertion failure/
  );
  assert.equal(client.matches.length, 4);
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(!client.commands.includes('COMMIT'));
  assert.ok(client.released);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { PoolClient } from 'pg';
import pool from '../src/config/db';
import { validateMatchBody } from '../src/controllers/matchController';
import { validateTournament } from '../src/controllers/tournamentController';
import { DomainError, TournamentStatus } from '../src/domain/competitionRules';
import {
  Match,
  MatchInput,
  createManualMatch,
  updateMatch,
  validateFinalCompletion
} from '../src/models/Match';

const finalDate = new Date('2026-01-10T20:00:00-03:00');

const createFinalFixture = (status: Match['status'] = 'scheduled'): Match => ({
  id: 10,
  tournament_id: 1,
  home_team_id: 7,
  away_team_id: 8,
  match_date: finalDate,
  location: 'Firmat',
  round: 'final',
  home_goals: status === 'finished' ? 2 : null,
  away_goals: status === 'finished' ? 1 : null,
  home_penalties: null,
  away_penalties: null,
  winner_team_id: status === 'finished' ? 7 : null,
  status,
  created_at: new Date('2026-01-01T00:00:00Z')
});

const createFinishedFinalInput = (winner: 7 | 8 = 7): MatchInput => ({
  tournament_id: 1,
  home_team_id: 7,
  away_team_id: 8,
  match_date: finalDate,
  location: 'Firmat',
  round: 'final',
  home_goals: winner === 7 ? 2 : 1,
  away_goals: winner === 8 ? 2 : 1,
  home_penalties: null,
  away_penalties: null,
  winner_team_id: winner,
  status: 'finished'
});

const completionTournament = (
  status: TournamentStatus = 'in_progress',
  championTeamId: number | null = null
) => ({ id: 1, status, champion_team_id: championTeamId });

class FakeFinalClient {
  public readonly commands: string[] = [];
  public released = false;
  public failOnMatchUpdate = false;
  public failOnTournamentUpdate = false;
  public winnerBelongs = true;
  public teamRoundConflict = false;
  public finalMatchIds = [10];

  private stagedMatch: Match | null = null;
  private stagedTournament: { status: TournamentStatus; champion_team_id: number | null } | null = null;

  constructor(
    public match: Match,
    public tournament: { id: number; status: TournamentStatus; champion_team_id: number | null }
  ) {}

  public async query(queryText: string, values: unknown[] = []): Promise<unknown> {
    const sql = queryText.replace(/\s+/g, ' ').trim();
    this.commands.push(sql);

    if (sql === 'BEGIN') return this.result([]);

    if (sql === 'COMMIT') {
      if (this.stagedMatch) this.match = this.stagedMatch;
      if (this.stagedTournament) {
        this.tournament = { ...this.tournament, ...this.stagedTournament };
      }
      this.stagedMatch = null;
      this.stagedTournament = null;
      return this.result([]);
    }

    if (sql === 'ROLLBACK') {
      this.stagedMatch = null;
      this.stagedTournament = null;
      return this.result([]);
    }

    if (sql.includes('FROM matches') && sql.includes('WHERE id = $1') && sql.includes('FOR UPDATE')) {
      return this.result(this.match.id === values[0] ? [this.match] : []);
    }

    if (sql.includes('FROM tournaments') && sql.includes('ANY($1::integer[])')) {
      const ids = values[0] as number[];
      return this.result(ids.includes(this.tournament.id) ? [this.tournament] : []);
    }

    if (sql.startsWith('SELECT status FROM tournaments')) {
      return this.result([this.tournament]);
    }

    if (sql.startsWith('SELECT t.max_teams')) {
      return this.result([{
        max_teams: 4,
        tournament_status: this.tournament.status,
        home_team_exists: true,
        away_team_exists: true,
        team_round_conflict: this.teamRoundConflict
      }]);
    }

    if (sql.includes("round = 'final'") && sql.includes('ORDER BY id ASC')) {
      return this.result(this.finalMatchIds.map((id) => ({ id })));
    }

    if (sql.startsWith('SELECT EXISTS') && sql.includes('FROM teams')) {
      return this.result([{ exists: this.winnerBelongs }]);
    }

    if (sql.startsWith('UPDATE matches')) {
      if (this.failOnMatchUpdate) throw new Error('Simulated final match update failure');
      this.stagedMatch = {
        id: this.match.id,
        tournament_id: values[0] as number,
        home_team_id: values[1] as number,
        away_team_id: values[2] as number,
        match_date: values[3] as Date,
        location: values[4] as string,
        round: values[5] as Match['round'],
        home_goals: values[6] as number | null,
        away_goals: values[7] as number | null,
        home_penalties: values[8] as number | null,
        away_penalties: values[9] as number | null,
        winner_team_id: values[10] as number | null,
        status: values[11] as Match['status'],
        created_at: this.match.created_at
      };
      return this.result([this.stagedMatch]);
    }

    if (sql.startsWith('UPDATE tournaments')) {
      if (this.failOnTournamentUpdate) {
        throw new Error('Simulated tournament completion failure');
      }
      if (this.tournament.status !== 'in_progress' || this.tournament.champion_team_id !== null) {
        return this.result([]);
      }
      this.stagedTournament = {
        status: 'finished',
        champion_team_id: values[1] as number
      };
      return this.result([{ id: this.tournament.id }]);
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

const withFakeClient = async <T>(client: FakeFinalClient, action: () => Promise<T>): Promise<T> => {
  const originalConnect = pool.connect;
  pool.connect = (async () => client as unknown as PoolClient) as typeof pool.connect;

  try {
    return await action();
  } finally {
    pool.connect = originalConnect;
  }
};

test('final completion accepts either participant as champion', () => {
  assert.equal(validateFinalCompletion(
    10,
    createFinishedFinalInput(7),
    completionTournament(),
    [10],
    true
  ), 7);
  assert.equal(validateFinalCompletion(
    10,
    createFinishedFinalInput(8),
    completionTournament(),
    [10],
    true
  ), 8);
});

test('penalty shootout winner becomes the final winner source', () => {
  const validation = validateMatchBody({
    tournament_id: 1,
    home_team_id: 7,
    away_team_id: 8,
    match_date: '2026-01-10 20:00',
    location: 'Firmat',
    round: 'final',
    home_goals: 1,
    away_goals: 1,
    home_penalties: 4,
    away_penalties: 5,
    status: 'finished'
  }, new Date('2026-02-01T00:00:00-03:00'));

  assert.equal(validation.data?.winner_team_id, 8);
  assert.equal(validateFinalCompletion(
    10,
    validation.data!,
    completionTournament(),
    [10],
    true
  ), 8);
});

test('invalid tied final never reaches tournament completion', () => {
  const validation = validateMatchBody({
    tournament_id: 1,
    home_team_id: 7,
    away_team_id: 8,
    match_date: '2026-01-10 20:00',
    location: 'Firmat',
    round: 'final',
    home_goals: 1,
    away_goals: 1,
    status: 'finished'
  }, new Date('2026-02-01T00:00:00-03:00'));

  assert.equal(validation.data, undefined);
});

test('final winner must be a participant from the same tournament', () => {
  assert.throws(
    () => validateFinalCompletion(
      10,
      { ...createFinishedFinalInput(), winner_team_id: 99 },
      completionTournament(),
      [10],
      true
    ),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_FINAL_WINNER'
  );
  assert.throws(
    () => validateFinalCompletion(
      10,
      createFinishedFinalInput(),
      completionTournament(),
      [10],
      false
    ),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'FINAL_WINNER_TOURNAMENT_MISMATCH'
  );
});

test('only one final can complete an in-progress tournament', () => {
  assert.throws(
    () => validateFinalCompletion(
      10,
      createFinishedFinalInput(),
      completionTournament(),
      [10, 11],
      true
    ),
    (error: unknown) => error instanceof DomainError && error.code === 'INCONSISTENT_FINAL_MATCHES'
  );
  for (const status of ['open', 'finished'] as const) {
    assert.throws(
      () => validateFinalCompletion(
        10,
        createFinishedFinalInput(),
        completionTournament(status),
        [10],
        true
      ),
      (error: unknown) => error instanceof DomainError &&
        error.code === 'TOURNAMENT_COMPLETION_CONFLICT'
    );
  }
});

test('champion cannot already be defined before completion', () => {
  assert.throws(
    () => validateFinalCompletion(
      10,
      createFinishedFinalInput(),
      completionTournament('in_progress', 7),
      [10],
      true
    ),
    (error: unknown) => error instanceof DomainError &&
      error.code === 'TOURNAMENT_COMPLETION_CONFLICT'
  );
});

test('tournament CRUD rejects champion_team_id', () => {
  const createResult = validateTournament({
    name: 'Copa Regional',
    location: 'Firmat',
    rules: 'official_rules_football_7',
    format: 'knockout',
    modality: 'futbol_7',
    max_teams: 4,
    champion_team_id: 7
  }, false);
  const updateResult = validateTournament({ champion_team_id: 7 }, true);

  assert.equal(createResult.data, undefined);
  assert.ok(createResult.errors.some((error) => error.includes('champion_team_id')));
  assert.equal(updateResult.data, undefined);
  assert.ok(updateResult.errors.some((error) => error.includes('champion_team_id')));
});

test('finishing the final commits match and tournament together', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());

  const result = await withFakeClient(client, () => updateMatch(
    client.match.id,
    createFinishedFinalInput(8)
  ));

  assert.equal(result?.status, 'finished');
  assert.equal(result?.winner_team_id, 8);
  assert.equal(client.match.status, 'finished');
  assert.equal(client.tournament.status, 'finished');
  assert.equal(client.tournament.champion_team_id, 8);
  assert.ok(client.commands.includes('COMMIT'));
  assert.ok(!client.commands.includes('ROLLBACK'));
  assert.ok(client.released);
});

test('tournament update failure rolls back the final result', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());
  client.failOnTournamentUpdate = true;

  await assert.rejects(
    withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput())),
    /Simulated tournament completion failure/
  );
  assert.equal(client.match.status, 'scheduled');
  assert.equal(client.match.winner_team_id, null);
  assert.equal(client.tournament.status, 'in_progress');
  assert.equal(client.tournament.champion_team_id, null);
  assert.ok(client.commands.includes('ROLLBACK'));
});

test('final match update failure leaves tournament unchanged', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());
  client.failOnMatchUpdate = true;

  await assert.rejects(
    withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput())),
    /Simulated final match update failure/
  );
  assert.equal(client.match.status, 'scheduled');
  assert.equal(client.tournament.status, 'in_progress');
  assert.equal(client.tournament.champion_team_id, null);
  assert.ok(client.commands.includes('ROLLBACK'));
});

test('duplicate completion cannot replace the champion', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());
  await withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput(7)));

  await assert.rejects(
    withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput(8))),
    (error: unknown) => error instanceof DomainError && error.code === 'MATCH_FINISHED_LOCKED'
  );
  assert.equal(client.tournament.status, 'finished');
  assert.equal(client.tournament.champion_team_id, 7);
});

test('match update rechecks round participants after acquiring the tournament lock', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());
  client.teamRoundConflict = true;
  await assert.rejects(
    withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput())),
    (error: unknown) => error instanceof DomainError && error.code === 'MATCH_TEAM_ROUND_CONFLICT'
  );
  const lockIndex = client.commands.findIndex(sql => sql.includes('ANY($1::integer[])'));
  const validationIndex = client.commands.findIndex(sql => sql.startsWith('SELECT t.max_teams'));
  assert.ok(lockIndex >= 0 && validationIndex > lockIndex);
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(!client.commands.some(sql => sql.startsWith('UPDATE matches')));
});

test('manual creation rechecks round participants before inserting', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament('open'));
  client.teamRoundConflict = true;
  await assert.rejects(
    withFakeClient(client, () => createManualMatch({
      ...createFinishedFinalInput(), status: 'scheduled',
      home_goals: null, away_goals: null, winner_team_id: null
    })),
    (error: unknown) => error instanceof DomainError && error.code === 'MATCH_TEAM_ROUND_CONFLICT'
  );
  const lockIndex = client.commands.findIndex(sql => sql.startsWith('SELECT status FROM tournaments'));
  const validationIndex = client.commands.findIndex(sql => sql.startsWith('SELECT t.max_teams'));
  assert.ok(lockIndex >= 0 && validationIndex > lockIndex);
  assert.ok(client.commands.includes('ROLLBACK'));
  assert.ok(!client.commands.some(sql => sql.startsWith('INSERT INTO matches')));
});

test('multiple final matches abort before any update', async () => {
  const client = new FakeFinalClient(createFinalFixture(), completionTournament());
  client.finalMatchIds = [10, 11];

  await assert.rejects(
    withFakeClient(client, () => updateMatch(client.match.id, createFinishedFinalInput())),
    (error: unknown) => error instanceof DomainError && error.code === 'INCONSISTENT_FINAL_MATCHES'
  );
  assert.equal(client.match.status, 'scheduled');
  assert.equal(client.tournament.status, 'in_progress');
  assert.ok(!client.commands.some((sql) => sql.startsWith('UPDATE matches')));
});

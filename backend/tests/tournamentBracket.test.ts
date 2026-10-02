import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { after, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import pool from '../src/config/db';
import { MATCH_ROUNDS, MatchRound, TournamentCapacity } from '../src/domain/competitionRules';
import { Match } from '../src/models/Match';
import { Team } from '../src/models/teammodel';
import { Tournament, TournamentBracket } from '../src/models/Tournament';
import tournamentRoutes from '../src/routes/tournamentRoutes';

const fixtureDate = new Date('2026-01-01T00:00:00Z');
let tournaments: Tournament[];
let teams: Team[];
let matches: Match[];
let commands: string[];
let queryFailure: boolean;

const createMatchFixture = (id: number, round: MatchRound, tournamentId = 1): Match => ({
  id,
  tournament_id: tournamentId,
  home_team_id: 1,
  away_team_id: 2,
  match_date: fixtureDate,
  location: 'Court One',
  round,
  home_goals: null,
  away_goals: null,
  home_penalties: null,
  away_penalties: null,
  winner_team_id: null,
  status: 'scheduled',
  created_at: fixtureDate
});

const getTeamSummary = (id: number | null) => {
  const team = teams.find((item) => item.id === id);
  return team ? { id: team.id, name: team.name } : null;
};

const app = express();
app.use(tournamentRoutes);
const server = app.listen(0, '127.0.0.1');
let baseUrl: string;

before(async () => {
  if (!server.listening) await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.method(pool, 'query', async (queryText: string, values: unknown[]) => {
    const sql = queryText.replace(/\s+/g, ' ').trim();
    commands.push(sql);
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|FOR UPDATE)\b/i);
    assert.equal(values.length, 1);
    if (queryFailure) throw new Error('Simulated database failure');

    if (sql.includes('FROM tournaments')) {
      assert.match(sql, /WHERE id = \$1$/);
      assert.match(sql, /team.id = tournaments.champion_team_id/);
      const tournament = tournaments.find((item) => item.id === values[0]);
      return { rows: tournament ? [{
        ...tournament,
        champion: getTeamSummary(tournament.champion_team_id)
      }] : [] };
    }

    assert.match(sql, /FROM matches match_row/);
    assert.match(sql, /WHERE match_row.tournament_id = \$1 ORDER BY match_row.id ASC$/);
    for (const role of ['home', 'away', 'winner']) {
      assert.ok(sql.includes(`LEFT JOIN teams ${role}_team ON ${role}_team.id = match_row.${role}_team_id`));
    }
    return { rows: matches
      .filter((match) => match.tournament_id === values[0])
      .sort((left, right) => left.id - right.id)
      .map((match) => ({
        ...match,
        home_team: getTeamSummary(match.home_team_id),
        away_team: getTeamSummary(match.away_team_id),
        winner_team: getTeamSummary(match.winner_team_id)
      })) };
  });
});

after(async () => {
  mock.restoreAll();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

beforeEach(() => {
  tournaments = [{
    id: 1,
    name: 'Demo Cup',
    location: 'Firmat',
    rules: 'official_rules_football_5',
    format: 'knockout',
    modality: 'futbol_5',
    max_teams: 4,
    status: 'open',
    champion_team_id: null,
    created_at: fixtureDate
  }];
  teams = [1, 2, 3, 4].map((id) => ({
    id, tournament_id: 1, name: `Team ${id}`, players_count: 7, created_at: fixtureDate
  }));
  matches = [];
  commands = [];
  queryFailure = false;
});

const getBracket = async (id = '1'): Promise<TournamentBracket> => {
  const response = await fetch(`${baseUrl}/tournaments/${id}/bracket`);
  assert.equal(response.status, 200);
  return await response.json() as TournamentBracket;
};

test('bracket rejects invalid IDs without querying the database', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '2147483648']) {
    const response = await fetch(`${baseUrl}/tournaments/${id}/bracket`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: true, message: 'Invalid tournament id' });
  }
  assert.equal(commands.length, 0);
});

test('bracket returns 404 for a missing tournament', async () => {
  const response = await fetch(`${baseUrl}/tournaments/999/bracket`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: true, message: 'Tournament not found' });
  assert.equal(commands.length, 1);
});

test('open tournament without matches has empty rounds and null champion', async () => {
  const bracket = await getBracket();
  assert.equal(bracket.tournament.name, 'Demo Cup');
  assert.equal(bracket.tournament.status, 'open');
  assert.equal(bracket.tournament.champion_team_id, null);
  assert.equal(bracket.tournament.champion, null);
  assert.deepEqual(bracket.rounds, []);
});

const firstRounds: [TournamentCapacity, MatchRound][] = [
  [4, 'semi_final'], [8, 'quarter_final'], [16, 'round_of_16'], [32, 'round_of_32']
];
for (const [capacity, round] of firstRounds) {
  test(`started ${capacity}-team tournament returns only its existing first round`, async () => {
    tournaments[0]!.status = 'in_progress';
    tournaments[0]!.max_teams = capacity;
    matches = Array.from({ length: capacity / 2 }, (_, index) => createMatchFixture(index + 1, round));
    const bracket = await getBracket();
    assert.equal(bracket.tournament.status, 'in_progress');
    assert.deepEqual(bracket.rounds.map((item) => item.round), [round]);
    assert.equal(bracket.rounds[0]!.matches.length, capacity / 2);
  });
}

test('multiple rounds follow competitive order rather than alphabetical or match ID order', async () => {
  tournaments[0]!.max_teams = 32;
  tournaments[0]!.status = 'in_progress';
  matches = [...MATCH_ROUNDS].reverse().map((round, index) => createMatchFixture(index + 1, round));
  const bracket = await getBracket();
  assert.deepEqual(bracket.rounds.map((item) => item.round), [...MATCH_ROUNDS]);
});

test('finished tournament returns its final and stored champion', async () => {
  tournaments[0]!.status = 'finished';
  tournaments[0]!.champion_team_id = 2;
  matches = [{ ...createMatchFixture(5, 'final'), status: 'finished',
    home_goals: 1, away_goals: 2, winner_team_id: 2 }];
  const bracket = await getBracket();
  assert.equal(bracket.tournament.status, 'finished');
  assert.equal(bracket.tournament.champion_team_id, 2);
  assert.deepEqual(bracket.tournament.champion, { id: 2, name: 'Team 2' });
  assert.equal(bracket.rounds[0]!.round, 'final');
  assert.deepEqual(bracket.rounds[0]!.matches[0]!.winner_team, { id: 2, name: 'Team 2' });
});

test('bracket excludes matches belonging to other tournaments', async () => {
  matches = [createMatchFixture(1, 'semi_final'), createMatchFixture(2, 'final', 99)];
  const bracket = await getBracket();
  assert.deepEqual(bracket.rounds.flatMap((item) => item.matches.map((match) => match.id)), [1]);
});

test('each round keeps stable ascending match IDs across repeated reads', async () => {
  matches = [createMatchFixture(9, 'semi_final'), createMatchFixture(3, 'semi_final'),
    createMatchFixture(15, 'final')];
  const first = await getBracket();
  assert.deepEqual(first.rounds[0]!.matches.map((match) => match.id), [3, 9]);
  assert.deepEqual(await getBracket(), first);
});

test('pending match returns team summaries and null winner without inventing a result', async () => {
  matches = [createMatchFixture(1, 'semi_final')];
  const match = (await getBracket()).rounds[0]!.matches[0]!;
  assert.deepEqual(match.home_team, { id: 1, name: 'Team 1' });
  assert.deepEqual(match.away_team, { id: 2, name: 'Team 2' });
  assert.equal(match.winner_team_id, null);
  assert.equal(match.winner_team, null);
  assert.equal(match.home_goals, null);
  assert.equal(match.away_goals, null);
});

test('bracket preserves goals, penalties and stored winner without recalculation', async () => {
  matches = [{ ...createMatchFixture(1, 'semi_final'), status: 'finished',
    home_goals: 2, away_goals: 2, home_penalties: 5, away_penalties: 4, winner_team_id: 2 }];
  const match = (await getBracket()).rounds[0]!.matches[0]!;
  assert.equal(match.home_goals, 2);
  assert.equal(match.away_goals, 2);
  assert.equal(match.home_penalties, 5);
  assert.equal(match.away_penalties, 4);
  assert.equal(match.winner_team_id, 2);
  assert.deepEqual(match.winner_team, { id: 2, name: 'Team 2' });
});

test('champion comes only from champion_team_id, never from the final result', async () => {
  matches = [{ ...createMatchFixture(1, 'final'), winner_team_id: 1 }];
  assert.equal((await getBracket()).tournament.champion, null);
  tournaments[0]!.champion_team_id = 3;
  assert.deepEqual((await getBracket()).tournament.champion, { id: 3, name: 'Team 3' });
});

test('bracket only reads records and performs two queries regardless of match count', async () => {
  matches = Array.from({ length: 31 }, (_, index) => createMatchFixture(index + 1, 'round_of_32'));
  const before = structuredClone({ tournaments, teams, matches });
  await getBracket();
  assert.equal(commands.length, 2);
  assert.deepEqual({ tournaments, teams, matches }, before);
});

test('bracket returns existing manual rounds in an open tournament without generating missing rounds', async () => {
  matches = [createMatchFixture(1, 'quarter_final')];
  assert.deepEqual((await getBracket()).rounds.map((item) => item.round), ['quarter_final']);
});

test('database failure returns the existing JSON error convention', async () => {
  queryFailure = true;
  const response = await fetch(`${baseUrl}/tournaments/1/bracket`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error getting tournament bracket' });
});

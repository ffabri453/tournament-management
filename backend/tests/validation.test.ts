import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMatchDate, validateMatchBody } from '../src/controllers/matchController';
import { validateTeamBody } from '../src/controllers/teamcontroller';
import { validateTournament } from '../src/controllers/tournamentController';

const validTournament = {
  name: 'Regional Cup',
  location: 'Firmat',
  rules: 'official_rules_football_7',
  format: 'knockout',
  modality: 'futbol_7',
  max_teams: 8
};

test('accepts the supported tournament domain values', () => {
  const result = validateTournament(validTournament, false);
  assert.ok(result.data);
  assert.equal(result.data.status, 'open');
});

test('rejects numeric names and unsupported tournament values', () => {
  const result = validateTournament({
    ...validTournament,
    name: '123',
    location: 'Santa Fe',
    modality: 'futbol_8',
    max_teams: 6
  }, false);

  assert.equal(result.data, undefined);
  assert.ok(result.errors.length >= 4);
});

test('requires the rules identifier that belongs to the modality', () => {
  const missing = validateTournament({ ...validTournament, rules: undefined }, false);
  assert.equal(missing.data, undefined);
  assert.ok(missing.errors.includes('rules is required'));

  const mismatched = validateTournament({
    ...validTournament,
    rules: 'official_rules_football_5'
  }, false);
  assert.equal(mismatched.data, undefined);
  assert.ok(mismatched.errors.some((error) => error.startsWith('rules must match modality')));
});

test('team payload only accepts the remaining fields', () => {
  assert.ok(validateTeamBody({
    tournament_id: 1,
    name: 'Los Halcones',
    players_count: 14
  }).data);

  assert.equal(validateTeamBody({
    tournament_id: 1,
    name: 'Los Halcones',
    players_count: 14,
    captain: 'Someone'
  }).data, undefined);
});

test('accepts a simple Argentina date and time', () => {
  assert.equal(
    parseMatchDate('2026-08-09 17:00')?.toISOString(),
    '2026-08-09T20:00:00.000Z'
  );
  assert.equal(parseMatchDate('2026-02-30 17:00'), null);
});

const finishedMatch = {
  tournament_id: 1,
  home_team_id: 10,
  away_team_id: 11,
  match_date: '2026-08-01T20:00:00-03:00',
  location: 'Cancha 1',
  round: 'quarter_final',
  home_goals: 3,
  away_goals: 2,
  status: 'finished'
};

test('derives the winner from the score', () => {
  const result = validateMatchBody(finishedMatch, new Date('2026-08-06T12:00:00-03:00'));
  assert.ok(result.data);
  assert.equal(result.data.winner_team_id, 10);
});

test('rejects a winner that contradicts the score', () => {
  const result = validateMatchBody(
    { ...finishedMatch, winner_team_id: 11 },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.equal(result.data, undefined);
  assert.ok(result.errors.includes('winner_team_id does not match the match result'));
});

test('uses penalty shootouts to resolve a tied match', () => {
  const result = validateMatchBody(
    {
      ...finishedMatch,
      home_goals: 2,
      away_goals: 2,
      home_penalties: 4,
      away_penalties: 5
    },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.ok(result.data);
  assert.equal(result.data.winner_team_id, 11);
});

test('rejects a penalty winner that contradicts the shootout', () => {
  const result = validateMatchBody(
    {
      ...finishedMatch,
      home_goals: 2,
      away_goals: 2,
      home_penalties: 4,
      away_penalties: 5,
      winner_team_id: 10
    },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.equal(result.data, undefined);
  assert.ok(result.errors.includes('winner_team_id does not match the match result'));
});

test('requires penalties when regular goals are tied', () => {
  const result = validateMatchBody(
    { ...finishedMatch, home_goals: 2, away_goals: 2 },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.equal(result.data, undefined);
  assert.ok(result.errors.some((error) => error.includes('require home_penalties')));
});

test('rejects tied penalty shootouts', () => {
  const result = validateMatchBody(
    {
      ...finishedMatch,
      home_goals: 2,
      away_goals: 2,
      home_penalties: 5,
      away_penalties: 5
    },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.equal(result.data, undefined);
  assert.ok(result.errors.includes('home_penalties and away_penalties must be different'));
});

test('rejects penalties when regular goals are not tied', () => {
  const result = validateMatchBody(
    { ...finishedMatch, home_penalties: 5, away_penalties: 4 },
    new Date('2026-08-06T12:00:00-03:00')
  );
  assert.equal(result.data, undefined);
  assert.ok(result.errors.includes('penalties are only allowed when regular goals are tied'));
});

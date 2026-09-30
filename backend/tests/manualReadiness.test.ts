import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTournament } from '../src/controllers/tournamentController';
import { validateTeamBody } from '../src/controllers/teamcontroller';
import { validateMatchBody } from '../src/controllers/matchController';
import { DomainError, isPositiveInteger, parseMatchDate } from '../src/domain/competitionRules';
import { validateManualMatchCreation } from '../src/models/Match';

const tournament = {
  name: 'Copa', location: 'Firmat', rules: 'official_rules_football_5',
  format: 'knockout', modality: 'futbol_5', max_teams: 4
};
const team = { tournament_id: 1, name: 'Equipo', players_count: 7 };
const match = {
  tournament_id: 1, home_team_id: 1, away_team_id: 2,
  location: 'Cancha', round: 'semi_final', status: 'scheduled',
  match_date: '2099-01-10 20:00'
};

for (const length of [100, 101]) {
  test(`validates SQL text boundary of ${length} characters on create and update`, () => {
    const value = 'A'.repeat(length);
    const accepted = length === 100;
    assert.equal(Boolean(validateTournament({ ...tournament, name: value }, false).data), accepted);
    assert.equal(Boolean(validateTournament({ name: value }, true).data), accepted);
    assert.equal(Boolean(validateTeamBody({ ...team, name: value }).data), accepted);
    assert.equal(Boolean(validateMatchBody({ ...match, location: value }).data), accepted);
  });
}

test('text limit uses trimmed Unicode characters like PostgreSQL', () => {
  const value = '  ' + '\u{1F3C6}'.repeat(100) + '  ';
  assert.ok(validateTournament({ ...tournament, name: value }, false).data);
  assert.ok(validateTeamBody({ ...team, name: value }).data);
  assert.ok(validateMatchBody({ ...match, location: value }).data);
});

test('manual creation rejects a finished final but preserves scheduled finals and other rounds', () => {
  assert.throws(
    () => validateManualMatchCreation('open', { round: 'final', status: 'finished' }),
    (error: unknown) => error instanceof DomainError && error.code === 'MANUAL_FINISHED_FINAL_LOCKED'
  );
  assert.doesNotThrow(() => validateManualMatchCreation('open', { round: 'final', status: 'scheduled' }));
  assert.doesNotThrow(() => validateManualMatchCreation('open', { round: 'semi_final', status: 'finished' }));
});

test('IDs fit PostgreSQL INTEGER boundaries', () => {
  assert.equal(isPositiveInteger(2147483647), true);
  for (const value of [0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1']) {
    assert.equal(isPositiveInteger(value), false);
  }
});

test('goals and penalties reject integer overflow', () => {
  const finished = { ...match, match_date: '2026-01-01 12:00', status: 'finished', home_goals: 2, away_goals: 0 };
  assert.ok(validateMatchBody({ ...finished, home_goals: 2147483647 }).data);
  assert.equal(validateMatchBody({ ...finished, home_goals: 2147483648 }).data, undefined);
  assert.equal(validateMatchBody({
    ...finished, home_goals: 1, away_goals: 1, home_penalties: 2147483648, away_penalties: 0
  }).data, undefined);
});

test('numeric signed names and null characters are rejected', () => {
  for (const name of ['-12', '+12', '-1.5', '.5', '1e3', 'A\u0000B']) {
    assert.equal(validateTournament({ ...tournament, name }, false).data, undefined);
    assert.equal(validateTournament({ name }, true).data, undefined);
    assert.equal(validateTeamBody({ ...team, name }).data, undefined);
    assert.equal(validateMatchBody({ ...match, location: name }).data, undefined);
  }
  assert.ok(validateTeamBody({ ...team, name: 'Sub-12' }).data);
});

test('ISO and local dates reject impossible calendar days', () => {
  for (const value of [
    '2099-02-30T12:00:00-03:00', '2026-02-29T12:00:00Z',
    '2099-04-31T12:00:00Z', '2099-02-30 12:00',
    '2099-01-10T24:00:00Z', '2099-01-10T12:00:60Z',
    '2099-01-10T12:00:00+25:00', '0000-01-01T12:00:00Z'
  ]) assert.equal(parseMatchDate(value), null, value);
});

test('date formats used by Bruno preserve time zone and milliseconds', () => {
  assert.equal(parseMatchDate('2028-02-29 12:00')?.toISOString(), '2028-02-29T15:00:00.000Z');
  assert.equal(parseMatchDate('2028-02-29T12:00:00-03:00')?.toISOString(), '2028-02-29T15:00:00.000Z');
  assert.equal(parseMatchDate('2028-02-29T15:00:00.123Z')?.toISOString(), '2028-02-29T15:00:00.123Z');
});

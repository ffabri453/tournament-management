import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTournament } from '../src/controllers/tournamentController';
import {
  DomainError,
  TournamentStatus
} from '../src/domain/competitionRules';
import {
  Match,
  MatchInput,
  validateManualMatchCreation,
  validateMatchDeletable,
  validateMatchEditable
} from '../src/models/Match';
import {
  Tournament,
  validateTournamentDeletable,
  validateTournamentMutable
} from '../src/models/Tournament';
import {
  Team,
  TeamInput,
  validateTeamDeletable,
  validateTeamMutable
} from '../src/models/teammodel';

const assertDomainCode = (action: () => void, code: string): void => {
  assert.throws(
    action,
    (error: unknown) => error instanceof DomainError && error.code === code
  );
};

const createTournamentFixture = (status: TournamentStatus): Tournament => ({
  id: 1,
  name: 'Copa Regional',
  location: 'Firmat',
  rules: 'official_rules_football_7',
  format: 'knockout',
  modality: 'futbol_7',
  max_teams: 8,
  status,
  champion_team_id: null,
  created_at: new Date('2026-01-01T00:00:00Z')
});

const teamFixture: Team = {
  id: 1,
  tournament_id: 1,
  name: 'Team One',
  players_count: 10,
  created_at: new Date('2026-01-01T00:00:00Z')
};

const matchFixture: Match = {
  id: 1,
  tournament_id: 1,
  home_team_id: 1,
  away_team_id: 2,
  match_date: new Date('2099-01-10T20:00:00-03:00'),
  location: 'Firmat',
  round: 'quarter_final',
  home_goals: null,
  away_goals: null,
  home_penalties: null,
  away_penalties: null,
  winner_team_id: null,
  status: 'scheduled',
  created_at: new Date('2026-01-01T00:00:00Z')
};

const asInput = (match: Match): MatchInput => ({
  tournament_id: match.tournament_id,
  home_team_id: match.home_team_id,
  away_team_id: match.away_team_id,
  match_date: match.match_date,
  location: match.location,
  round: match.round,
  home_goals: match.home_goals,
  away_goals: match.away_goals,
  home_penalties: match.home_penalties,
  away_penalties: match.away_penalties,
  winner_team_id: match.winner_team_id,
  status: match.status
});

test('generic tournament creation only accepts open status', () => {
  const baseBody = {
    name: 'Copa Regional',
    location: 'Firmat',
    rules: 'official_rules_football_7',
    format: 'knockout',
    modality: 'futbol_7',
    max_teams: 8
  };

  assert.ok(validateTournament({ ...baseBody, status: 'open' }, false).data);
  assert.equal(validateTournament({ ...baseBody, status: 'in_progress' }, false).data, undefined);
  assert.equal(validateTournament({ ...baseBody, status: 'finished' }, false).data, undefined);
});

test('generic tournament updates cannot manage status', () => {
  for (const currentStatus of ['open', 'in_progress', 'finished'] as const) {
    assertDomainCode(
      () => validateTournamentMutable(
        createTournamentFixture(currentStatus),
        { status: currentStatus }
      ),
      'TOURNAMENT_STATUS_MANAGED_BY_FLOW'
    );
  }
});

test('tournament structure is locked after start but its name remains editable', () => {
  for (const status of ['in_progress', 'finished'] as const) {
    const tournament = createTournamentFixture(status);
    assert.doesNotThrow(() => validateTournamentMutable(tournament, { name: 'Nuevo nombre' }));

    for (const update of [
      { location: 'Rosario' as const },
      { modality: 'futbol_11' as const },
      { max_teams: 16 as const }
    ]) {
      assertDomainCode(
        () => validateTournamentMutable(tournament, update),
        'TOURNAMENT_STRUCTURE_LOCKED'
      );
    }
  }
});

test('only open tournaments can be deleted', () => {
  assert.doesNotThrow(() => validateTournamentDeletable('open'));
  assertDomainCode(
    () => validateTournamentDeletable('open', true),
    'TOURNAMENT_DELETE_LOCKED'
  );
  assertDomainCode(() => validateTournamentDeletable('in_progress'), 'TOURNAMENT_DELETE_LOCKED');
  assertDomainCode(() => validateTournamentDeletable('finished'), 'TOURNAMENT_DELETE_LOCKED');
});

test('team name can change after start but tournament and player count are locked', () => {
  const renamed: TeamInput = {
    tournament_id: 1,
    name: 'Renamed Team',
    players_count: 10
  };
  assert.doesNotThrow(() => validateTeamMutable(teamFixture, renamed, 'in_progress'));
  assert.doesNotThrow(() => validateTeamMutable(teamFixture, renamed, 'finished'));

  assertDomainCode(
    () => validateTeamMutable(teamFixture, { ...renamed, tournament_id: 2 }, 'in_progress'),
    'TEAM_TOURNAMENT_LOCKED'
  );
  assertDomainCode(
    () => validateTeamMutable(teamFixture, { ...renamed, players_count: 11 }, 'in_progress'),
    'TEAM_STRUCTURE_LOCKED'
  );
});

test('teams can only be deleted while their tournament is open', () => {
  assert.doesNotThrow(() => validateTeamDeletable('open'));
  assertDomainCode(() => validateTeamDeletable('in_progress'), 'TEAM_DELETE_LOCKED');
  assertDomainCode(() => validateTeamDeletable('finished'), 'TEAM_DELETE_LOCKED');
});

test('manual match creation is limited to open tournaments', () => {
  assert.doesNotThrow(() => validateManualMatchCreation('open'));
  assertDomainCode(
    () => validateManualMatchCreation('in_progress'),
    'MANUAL_MATCH_CREATION_LOCKED'
  );
  assertDomainCode(
    () => validateManualMatchCreation('finished'),
    'MANUAL_MATCH_CREATION_LOCKED'
  );
});

test('an in-progress match can receive schedule and result changes', () => {
  const updated: MatchInput = {
    ...asInput(matchFixture),
    match_date: new Date('2099-01-11T20:00:00-03:00'),
    home_goals: 1,
    away_goals: 0,
    status: 'live'
  };

  assert.doesNotThrow(() => validateMatchEditable(
    matchFixture,
    updated,
    'in_progress',
    'in_progress'
  ));
});

test('match structure cannot change after tournament start', () => {
  const changes: MatchInput[] = [
    { ...asInput(matchFixture), tournament_id: 2 },
    { ...asInput(matchFixture), home_team_id: 3 },
    { ...asInput(matchFixture), away_team_id: 4 },
    { ...asInput(matchFixture), location: 'Rosario' },
    { ...asInput(matchFixture), round: 'semi_final' }
  ];

  for (const changed of changes) {
    assertDomainCode(
      () => validateMatchEditable(matchFixture, changed, 'in_progress', 'open'),
      'MATCH_STRUCTURE_LOCKED'
    );
  }
});

test('finished matches and matches in finished tournaments are immutable', () => {
  assertDomainCode(
    () => validateMatchEditable(
      { ...matchFixture, status: 'finished' },
      asInput(matchFixture),
      'in_progress',
      'in_progress'
    ),
    'MATCH_FINISHED_LOCKED'
  );
  assertDomainCode(
    () => validateMatchEditable(matchFixture, asInput(matchFixture), 'finished', 'finished'),
    'TOURNAMENT_MATCHES_LOCKED'
  );
});

test('matches can only move between open tournaments', () => {
  const moved = { ...asInput(matchFixture), tournament_id: 2 };
  assert.doesNotThrow(() => validateMatchEditable(matchFixture, moved, 'open', 'open'));
  assertDomainCode(
    () => validateMatchEditable(matchFixture, moved, 'open', 'in_progress'),
    'MATCH_TARGET_TOURNAMENT_LOCKED'
  );
});

test('match deletion preserves started brackets and finished history', () => {
  assert.doesNotThrow(() => validateMatchDeletable('scheduled', 'open'));
  assertDomainCode(() => validateMatchDeletable('finished', 'open'), 'MATCH_DELETE_LOCKED');
  assertDomainCode(() => validateMatchDeletable('scheduled', 'in_progress'), 'MATCH_DELETE_LOCKED');
  assertDomainCode(() => validateMatchDeletable('scheduled', 'finished'), 'MATCH_DELETE_LOCKED');
});

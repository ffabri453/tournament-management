import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import pool from '../src/config/db';

let server: Server;
let url: string;
const tournament = { id: 1, name: 'Public Cup', location: 'Firmat', format: 'knockout',
  modality: 'futbol_5', max_teams: 4, rules: 'official_rules_football_5', status: 'finished',
  champion_team_id: 2, created_at: '2026-01-01T00:00:00.000Z' };
const teams = [1, 2].map(id => ({ id, tournament_id: 1, name: `Team ${id}`,
  players_count: 7, created_at: tournament.created_at }));
const champion = { id: 2, name: 'Team 2' };
const match = { id: 3, tournament_id: 1, home_team_id: 1, away_team_id: 2,
  match_date: tournament.created_at, location: 'Court One', round: 'final',
  home_goals: 1, away_goals: 2, home_penalties: null, away_penalties: null,
  winner_team_id: 2, status: 'finished', created_at: tournament.created_at };
const bracketMatch = { ...match, home_team: { id: 1, name: 'Team 1' },
  away_team: champion, winner_team: champion };

before(async () => {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  const { app } = require('../server') as typeof import('../server');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  mock.method(pool, 'query', async (text: string, values?: unknown[]) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|users)\b/i);
    if (sql.includes('FROM tournaments')) {
      if (values && values[0] !== 1) return { rows: [] };
      return { rows: [sql.includes('AS champion') ? { ...tournament, champion } : tournament] };
    }
    if (sql.includes('FROM matches match_row')) return { rows: [bracketMatch] };
    if (sql.includes('FROM matches')) return { rows: [match] };
    assert.match(sql, /FROM teams/);
    return { rows: values ? teams.filter(team => team.id === values[0]) : teams };
  });
});

afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('visitors can list tournaments and read an individual tournament without JWT', async () => {
  const list = await fetch(`${url}/tournaments`);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [tournament]);
  const detail = await fetch(`${url}/tournaments/1`);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), tournament);
});

test('public detail retains resource validation and not-found responses', async () => {
  for (const path of ['/tournaments', '/api/teams']) {
    assert.equal((await fetch(`${url}${path}/invalid`)).status, 400);
    assert.equal((await fetch(`${url}${path}/999`)).status, 404);
  }
  assert.equal((await fetch(`${url}/tournaments/invalid/bracket`)).status, 400);
  assert.equal((await fetch(`${url}/tournaments/999/bracket`)).status, 404);
});

test('visitors can read teams and resolve the champion name without JWT', async () => {
  const list = await fetch(`${url}/api/teams`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json() as { data: unknown }).data, teams);
  const detail = await fetch(`${url}/api/teams/2`);
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json() as { data: unknown }).data, teams[1]);
});

test('visitors can read matches and stored results without JWT', async () => {
  const response = await fetch(`${url}/matches`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: unknown }).data, [match]);
});

test('public bracket includes results, team summaries and the stored champion', async () => {
  const response = await fetch(`${url}/tournaments/1/bracket`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tournament: { ...tournament, champion }, rounds: [{ round: 'final', matches: [bracketMatch] }],
  });
});

test('public reads ignore unusable credentials and preserve trailing-slash and query support', async () => {
  for (const path of ['/tournaments/', '/tournaments/1/', '/tournaments/1/bracket/',
    '/api/teams/?tournament_id=1', '/api/teams/2/', '/matches/']) {
    const response = await fetch(`${url}${path}`, { headers: { Authorization: 'Bearer invalid' } });
    assert.equal(response.status, 200, path);
  }
});

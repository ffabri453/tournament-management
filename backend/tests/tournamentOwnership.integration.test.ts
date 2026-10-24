import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { mock, test } from 'node:test';
import { Pool } from 'pg';
import pool from '../src/config/db';
import { issueToken } from '../src/auth/token';

// Opt-in: uses real PostgreSQL in a unique schema, never the application's data.
test('ownership through HTTP, JWT and PostgreSQL', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const schema = `ownership_test_${randomBytes(8).toString('hex')}`;
  const db = new Pool({ ...pool.options, password: pool.options.password,
    options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  let created = false;
  let server: import('node:http').Server | undefined;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await db.query(readFileSync(resolve(__dirname, '../src/db/schema.sql'), 'utf8'));
    await db.query(`INSERT INTO users (name,email,password_hash,role) VALUES
      ('Owner','owner@example.test','unused','organizer'),
      ('Other','other@example.test','unused','organizer'),
      ('Admin','admin@example.test','unused','admin')`);
    const input = { name: 'Owner Cup', location: 'Firmat', modality: 'futbol_5',
      max_teams: 4, rules: 'official_rules_football_5', format: 'knockout' };
    await db.query(`ALTER TABLE tournaments DROP COLUMN organizer_id`);
    await db.query(`INSERT INTO tournaments (name, location, modality, max_teams, rules)
      VALUES ('Legacy Cup','Firmat','futbol_5',4,'official_rules_football_5')`);
    const migration = readFileSync(resolve(__dirname, '../src/db/migrations/008_tournament_organizer.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    assert.deepEqual((await db.query('SELECT organizer_id FROM tournaments')).rows, [{ organizer_id: null }]);
    await assert.rejects(db.query('UPDATE tournaments SET organizer_id=999'), { code: '23503' });

    mock.method(pool, 'query', db.query.bind(db));
    mock.method(pool, 'connect', db.connect.bind(db));
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    const { app } = require('../server') as typeof import('../server');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const tokens = [null, issueToken(1), issueToken(2), issueToken(3)];
    const request = async (method: string, path: string, actor: number, body?: object, status = 200) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tokens[actor]) headers.Authorization = `Bearer ${tokens[actor]}`;
      const response = await fetch(url + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      assert.equal(response.status, status, `${method} ${path} actor=${actor}: ${JSON.stringify(result)}`);
      return result;
    };
    await request('GET', '/tournaments', 0);
    await request('POST', '/tournaments', 0, input, 401);
    await request('POST', '/tournaments', 1, { ...input, organizer_id: 2 }, 400);
    const cup = await request('POST', '/tournaments', 1, input, 201);
    assert.equal(cup.organizer_id, 1);
    const other = await request('POST', '/tournaments', 2, { ...input, name: 'Other Cup' }, 201);
    assert.equal(other.organizer_id, 2);
    await request('PUT', '/tournaments/1', 1, { name: 'Legacy changed' }, 403);
    await request('PUT', '/tournaments/1', 3, { name: 'Legacy changed' });
    await request('PUT', `/tournaments/${cup.id}`, 1, { name: 'Owner renamed' });
    await request('PUT', `/tournaments/${cup.id}`, 3, { name: 'Admin renamed' });
    const date = { match_date: '2099-01-01T12:00:00-03:00' };
    for (const [method, suffix, body] of [
      ['PUT', '', { name: 'Forbidden change' }], ['DELETE', '', undefined],
      ['POST', '/start', date], ['POST', '/next-round', date],
    ] as const) {
      await request(method, `/tournaments/${cup.id}${suffix}`, 2, body, 403);
      await request(method, `/tournaments/${cup.id}${suffix}`, 0, body, 401);
    }
    const teamInput = { tournament_id: cup.id, name: 'Team Alpha', players_count: 7 };
    await request('POST', '/api/teams', 2, teamInput, 403);
    const teams: number[] = [];
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      const result = await request('POST', '/api/teams', 1, { ...teamInput, name: `Team ${name}` }, 201);
      teams.push(result.data.id);
    }
    const teamPath = `/api/teams/${teams[0]}`;
    await request('PUT', teamPath, 2, teamInput, 403);
    await request('DELETE', teamPath, 2, undefined, 403);
    await request('PUT', teamPath, 1, { ...teamInput, tournament_id: other.id }, 403);
    await request('PUT', teamPath, 2, { ...teamInput, tournament_id: other.id }, 403);
    await request('PUT', teamPath, 3, { ...teamInput, name: 'Admin team' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    for (const [actor, status] of [[0, 401], [2, 403], [1, 200], [3, 200]]) {
      const response = await fetch(url + teamPath + '/logo', { method: 'PUT',
        headers: { 'Content-Type': 'image/png', ...(tokens[actor!] ? { Authorization: `Bearer ${tokens[actor!]}` } : {}) }, body: png });
      assert.equal(response.status, status, `logo actor=${actor}`);
    }
    assert.equal((await fetch(url + teamPath + '/logo')).status, 200);
    await request('DELETE', teamPath + '/logo', 2, undefined, 403);
    await request('DELETE', teamPath + '/logo', 1);
    const matchInput = { tournament_id: cup.id, home_team_id: teams[0], away_team_id: teams[1],
      ...date, location: 'Cancha Central', round: 'semi_final', status: 'scheduled' };
    await request('POST', '/matches', 2, matchInput, 403);
    const manual = (await request('POST', '/matches', 1, matchInput, 201)).data;
    await request('PUT', `/matches/${manual.id}`, 2, matchInput, 403);
    await request('DELETE', `/matches/${manual.id}`, 2, undefined, 403);
    await request('PUT', `/matches/${manual.id}`, 3, { ...matchInput, location: 'Cancha Norte' });
    await request('DELETE', `/matches/${manual.id}`, 1);
    const started = (await request('POST', `/tournaments/${cup.id}/start`, 1, date, 201)).data;
    const finish = async (match: { id: number; home_team_id: number; away_team_id: number; round: string; location: string }, actor: number) => {
      const result = { ...matchInput, home_team_id: match.home_team_id, away_team_id: match.away_team_id,
        round: match.round, location: match.location, match_date: '2026-01-01T12:00:00-03:00', status: 'finished', home_goals: 2, away_goals: 1 };
      await request('PUT', `/matches/${match.id}`, 2, result, 403);
      await request('PUT', `/matches/${match.id}`, actor, result);
    };
    for (const match of started.matches) await finish(match, 1);
    await request('POST', `/tournaments/${cup.id}/next-round`, 2, date, 403);
    const next = (await request('POST', `/tournaments/${cup.id}/next-round`, 3, date, 201)).data;
    await finish(next.matches[0], 3);
    const finished = await request('GET', `/tournaments/${cup.id}`, 0);
    assert.equal(finished.status, 'finished');
    assert.ok(finished.champion_team_id);
    await request('GET', `/tournaments/${cup.id}/bracket`, 0);
    await request('GET', '/matches', 0);
    await request('DELETE', `/tournaments/${cup.id}`, 3, undefined, 409);
    await db.query("UPDATE users SET role='organizer' WHERE id=3");
    await request('PUT', '/tournaments/1', 3, { name: 'Demoted admin' }, 403);
    await request('DELETE', `/tournaments/${other.id}`, 2);
    await db.query("UPDATE users SET role='admin' WHERE id=3");
    await request('DELETE', '/tournaments/1', 3);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
    mock.restoreAll();
    await db.end();
    if (created) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, afterEach, before, mock, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { getJwtSecret, issueToken, verifyToken } from '../src/auth/token';
import pool from '../src/config/db';

let server: Server;
let url: string;
const user = { id: 1, name: 'User', email: 'user@example.com', role: 'organizer', created_at: '2026-01-01' };
before(async () => {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  const { app } = require('../server') as typeof import('../server');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('missing, malformed, forged, expired and wrong-algorithm credentials return 401 before querying', async () => {
  const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected query'); });
  const options = { subject: '1', issuer: 'tournament-management', audience: 'tournament-management' };
  for (const credential of [undefined, 'Basic abc', 'Bearer invalid', `Bearer ${issueToken(1)}x`,
    `Bearer ${jwt.sign({}, getJwtSecret(), { ...options, expiresIn: -1 })}`,
    `Bearer ${jwt.sign({}, getJwtSecret(), { ...options, algorithm: 'HS384', expiresIn: 3600 })}`,
    `Bearer ${jwt.sign({}, getJwtSecret(), options)}`]) {
    const response = await fetch(`${url}/auth/me`, { headers: credential ? { Authorization: credential } : {} });
    assert.equal(response.status, 401);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('valid token accesses protected resources and me returns only public user fields', async () => {
  mock.method(pool, 'query', async () => ({ rows: [user] }));
  const token = issueToken(1);
  assert.equal(verifyToken(token), 1);
  const payload = jwt.decode(token) as jwt.JwtPayload;
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  assert.equal(payload.exp! - payload.iat!, 3600);
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${url}/matches/1`, { headers })).status, 200);
  const response = await fetch(`${url}/auth/me`, { headers });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: user });
});

test('deleted users are rejected and database errors stay private', async () => {
  const query = mock.method(pool, 'query', async () => ({ rows: [] }));
  const headers = { Authorization: `Bearer ${issueToken(1)}` };
  assert.equal((await fetch(`${url}/auth/me`, { headers })).status, 401);
  query.mock.mockImplementation(async () => { throw new Error('SQL secret'); });
  const response = await fetch(`${url}/auth/me`, { headers });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error authenticating user' });
});

test('all mutations require authentication, including unsupported methods and unknown management routes', async () => {
  const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected query'); });
  for (const path of ['/tournaments', '/tournaments/1', '/tournaments/1/bracket',
    '/tournaments/1/start', '/tournaments/1/next-round', '/matches', '/matches/1',
    '/api/teams', '/api/teams/1']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(`${url}${path}`, { method })).status, 401, `${method} ${path}`);
    }
  }
  for (const path of ['/auth/me', '/db-test', '/matches/1', '/tournaments/1/start',
    '/tournaments/1/next-round', '/tournaments/1/admin', '/api/teams/1/admin']) {
    assert.equal((await fetch(`${url}${path}`)).status, 401, `GET ${path}`);
  }
  assert.equal(query.mock.callCount(), 0);
});

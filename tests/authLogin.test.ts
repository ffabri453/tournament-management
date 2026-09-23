import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, afterEach, before, mock, test } from 'node:test';
import bcrypt from 'bcrypt';
import express from 'express';
import pool from '../src/config/db';
import { validateLoginBody, validateRegisterBody } from '../src/controllers/authController';
import authRoutes from '../src/routes/authRoutes';

const password = ' ClaveSegura123 ';
const validBody = { email: 'fabri@example.com', password };
const publicUser = {
  id: 1, name: 'Fabrizio', email: validBody.email, role: 'organizer',
  created_at: new Date('2026-01-01T00:00:00Z')
};
const invalidCredentials = { error: true, message: 'Invalid credentials' };
let passwordHash: string;
let server: Server;
let baseUrl: string;

before(async () => {
  passwordHash = await bcrypt.hash(password, 12);
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

const postLogin = (body: unknown) => fetch(`${baseUrl}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

test('login shares register email normalization and preserves the password without a minimum length', () => {
  const email = ' FABRI@EXAMPLE.COM ';
  const login = validateLoginBody({ email, password });
  const register = validateRegisterBody({ name: 'Fabrizio', email, password });
  assert.deepEqual(login, { errors: [], data: validBody });
  assert.equal(login.data!.email, register.data!.email);
  assert.equal(validateLoginBody({ ...validBody, password: 'a' }).data!.password, 'a');
});

test('login rejects non-object bodies', () => {
  for (const body of [undefined, null, [], 'text', 123, true]) {
    assert.deepEqual(validateLoginBody(body), { errors: ['Request body must be a JSON object'] });
  }
});

test('login shares register email validation at the database length boundary', () => {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  assert.equal(email.length, 254);
  assert.ok(validateLoginBody({ ...validBody, email }).data);
  assert.equal(validateLoginBody({ ...validBody, email: `a${email}` }).data, undefined);
});

const invalidBodies: [string, unknown][] = [
  ['empty body', {}],
  ['array body', []],
  ['missing email', { password }],
  ['missing password', { email: validBody.email }],
  ['non-string email', { ...validBody, email: 123 }],
  ['null email', { ...validBody, email: null }],
  ['blank email', { ...validBody, email: '   ' }],
  ['invalid email', { ...validBody, email: 'invalid' }],
  ['missing domain suffix', { ...validBody, email: 'a@example' }],
  ['multiple at signs', { ...validBody, email: 'a@@example.com' }],
  ['spaces inside email', { ...validBody, email: 'a b@example.com' }],
  ['empty domain label', { ...validBody, email: 'a@example..com' }],
  ['control character in email', { ...validBody, email: 'a\0@example.com' }],
  ['long email', { ...validBody, email: `${'a'.repeat(243)}@example.com` }],
  ['empty password', { ...validBody, password: '' }],
  ['numeric password', { ...validBody, password: 12345678 }],
  ['null password', { ...validBody, password: null }],
  ['array password', { ...validBody, password: ['ClaveSegura123'] }],
  ['object password', { ...validBody, password: {} }],
  ['client-supplied role', { ...validBody, role: 'admin' }],
  ['client-supplied hash', { ...validBody, password_hash: 'injected' }]
];

for (const [label, body] of invalidBodies) {
  test(`login returns 400 for ${label} without querying or comparing`, async () => {
    const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected query'); });
    const compare = mock.method(bcrypt, 'compare', async () => { throw new Error('Unexpected compare'); });
    const response = await postLogin(body);
    assert.equal(response.status, 400);
    const result = await response.json() as { error: boolean; message: string; errors: string[] };
    assert.equal(result.error, true);
    assert.equal(result.message, 'Invalid login data');
    assert.ok(result.errors.length > 0);
    assert.equal(query.mock.callCount(), 0);
    assert.equal(compare.mock.callCount(), 0);
  });
}

for (const role of ['organizer', 'admin']) {
  test(`login accepts existing ${role} credentials and returns only public fields without tokens or cookies`, async () => {
    const query = mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
      assert.match(sql.trim(), /^SELECT /);
      assert.match(sql, /FROM users/);
      assert.deepEqual(values, [validBody.email]);
      return { rows: [{ ...publicUser, role, password_hash: passwordHash, password }] };
    });
    const compare = mock.method(bcrypt, 'compare');
    const hash = mock.method(bcrypt, 'hash', async () => { throw new Error('Unexpected hash'); });
    const response = await postLogin({ ...validBody, email: ' FABRI@EXAMPLE.COM ' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('authorization'), null);
    assert.deepEqual(await response.json(), {
      message: 'Login successful',
      data: { ...publicUser, role, created_at: publicUser.created_at.toISOString() }
    });
    assert.equal(query.mock.callCount(), 1);
    assert.equal(hash.mock.callCount(), 0);
    assert.equal(compare.mock.callCount(), 1);
    assert.deepEqual(compare.mock.calls[0]!.arguments, [password, passwordHash]);
  });
}

test('missing users and incorrect passwords receive exactly the same 401 JSON', async () => {
  mock.method(pool, 'query', async (_sql: string, values: unknown[]) => ({
    rows: values[0] === validBody.email ? [{ ...publicUser, password_hash: passwordHash }] : []
  }));
  for (const body of [
    { ...validBody, password: 'wrong' },
    { ...validBody, email: 'missing@example.com' },
    { ...validBody, password: password.trim() },
    { ...validBody, password: '   ' }
  ]) {
    const response = await postLogin(body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), invalidCredentials);
  }
});

test('login rejects a matching 72-byte prefix followed by extra bytes instead of accepting bcrypt truncation', async () => {
  const exactPassword = 'a'.repeat(72);
  const hash = await bcrypt.hash(exactPassword, 12);
  mock.method(pool, 'query', async () => ({ rows: [{ ...publicUser, password_hash: hash }] }));
  const accepted = await postLogin({ ...validBody, password: exactPassword });
  assert.equal(accepted.status, 200);
  await accepted.json();
  for (const candidate of [`${exactPassword}b`, '\u00e9'.repeat(37)]) {
    const response = await postLogin({ ...validBody, password: candidate });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), invalidCredentials);
  }
});

test('login hides real database failures behind a generic 500', async () => {
  mock.method(pool, 'query', async () => { throw new Error('SQL connection credentials'); });
  const response = await postLogin(validBody);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error logging in' });
});

test('login hides real bcrypt failures behind a generic 500', async () => {
  mock.method(pool, 'query', async () => ({ rows: [{ ...publicUser, password_hash: passwordHash }] }));
  mock.method(bcrypt, 'compare', async () => { throw new Error('Internal hash details'); });
  const response = await postLogin(validBody);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error logging in' });
});

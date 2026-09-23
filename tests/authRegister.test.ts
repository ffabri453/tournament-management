import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, afterEach, before, mock, test } from 'node:test';
import bcrypt from 'bcrypt';
import express from 'express';
import pool from '../src/config/db';
import { validateRegisterBody } from '../src/controllers/authController';
import authRoutes from '../src/routes/authRoutes';

const validBody = { name: 'Fabrizio', email: 'fabri@example.com', password: 'ClaveSegura123' };
const publicUser = {
  id: 1, name: validBody.name, email: validBody.email, role: 'organizer',
  created_at: new Date('2026-01-01T00:00:00Z')
};
let server: Server;
let baseUrl: string;

before(async () => {
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

const postRegister = (body: unknown) => fetch(`${baseUrl}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

test('register normalizes name and email, defaults role and preserves the exact password', () => {
  const password = '  abcdefgh  ';
  assert.deepEqual(validateRegisterBody({ name: '  Fabrizio  ', email: ' FABRI@EXAMPLE.COM ', password }), {
    errors: [], data: { ...validBody, password, role: 'organizer' }
  });
});

test('register accepts simple passwords and exact length boundaries', () => {
  for (const password of ['abcdefgh', 'a'.repeat(72), '\u00e9'.repeat(36), '\u{1f512}'.repeat(8)]) {
    assert.ok(validateRegisterBody({ ...validBody, password }).data);
  }
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  assert.equal(email.length, 254);
  assert.ok(validateRegisterBody({ ...validBody, name: 'A'.repeat(100), email }).data);
  assert.ok(validateRegisterBody({ ...validBody, role: 'organizer' }).data);
});

test('register validator rejects all non-object bodies', () => {
  for (const body of [undefined, null, [], 'text', 42, true]) {
    assert.deepEqual(validateRegisterBody(body), { errors: ['Request body must be a JSON object'] });
  }
});

const invalidBodies: [string, unknown][] = [
  ['empty body', {}],
  ['array body', []],
  ['missing name', { email: validBody.email, password: validBody.password }],
  ['missing email', { name: validBody.name, password: validBody.password }],
  ['missing password', { name: validBody.name, email: validBody.email }],
  ['non-string name', { ...validBody, name: 123 }],
  ['blank name', { ...validBody, name: '   ' }],
  ['numeric name', { ...validBody, name: '123' }],
  ['long name', { ...validBody, name: 'a'.repeat(101) }],
  ['null character in name', { ...validBody, name: 'Test\0Name' }],
  ['non-string email', { ...validBody, email: 123 }],
  ['blank email', { ...validBody, email: '   ' }],
  ['missing at sign', { ...validBody, email: 'example.com' }],
  ['missing domain suffix', { ...validBody, email: 'a@example' }],
  ['multiple at signs', { ...validBody, email: 'a@@example.com' }],
  ['spaces inside email', { ...validBody, email: 'a b@example.com' }],
  ['empty domain label', { ...validBody, email: 'a@example..com' }],
  ['control character in email', { ...validBody, email: 'a\0@example.com' }],
  ['long email', { ...validBody, email: `${'a'.repeat(243)}@example.com` }],
  ['non-string password', { ...validBody, password: 12345678 }],
  ['empty password', { ...validBody, password: '' }],
  ['blank password', { ...validBody, password: '        ' }],
  ['short password', { ...validBody, password: '1234567' }],
  ['short Unicode password', { ...validBody, password: '\u{1f512}'.repeat(7) }],
  ['long password', { ...validBody, password: 'a'.repeat(73) }],
  ['password exceeding UTF-8 byte limit', { ...validBody, password: '\u00e9'.repeat(37) }],
  ['null character in password', { ...validBody, password: 'abcdefgh\0' }],
  ['admin self-registration', { ...validBody, role: 'admin' }],
  ['arbitrary role', { ...validBody, role: 'manager' }],
  ['null role', { ...validBody, role: null }],
  ['non-string role', { ...validBody, role: ['organizer'] }],
  ['client-supplied hash', { ...validBody, password_hash: 'injected-hash' }],
  ['client-supplied ID', { ...validBody, id: 99 }]
];

for (const [label, body] of invalidBodies) {
  test(`register returns 400 for ${label} without hashing or querying PostgreSQL`, async () => {
    const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected query'); });
    const hash = mock.method(bcrypt, 'hash', async () => { throw new Error('Unexpected hash'); });
    const response = await postRegister(body);
    assert.equal(response.status, 400);
    const result = await response.json() as { error: boolean; message: string; errors: string[] };
    assert.equal(result.error, true);
    assert.equal(result.message, 'Invalid registration data');
    assert.ok(result.errors.length > 0);
    assert.equal(query.mock.callCount(), 0);
    assert.equal(hash.mock.callCount(), 0);
  });
}

test('register returns 201, inserts a real bcrypt hash and exposes only public fields', async () => {
  const hashes: string[] = [];
  const password = ' abcdefgh ';
  mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /INSERT INTO users/);
    assert.deepEqual([values[0], values[1], values[3]], ['Fabrizio', 'fabri@example.com', 'organizer']);
    const hash = values[2] as string;
    assert.notEqual(hash, password);
    assert.equal(bcrypt.getRounds(hash), 12);
    assert.equal(await bcrypt.compare(password, hash), true);
    assert.equal(await bcrypt.compare(password.trim(), hash), false);
    hashes.push(hash);
    return { rows: [{ ...publicUser, password_hash: hash, password }] };
  });

  for (const role of [undefined, 'organizer']) {
    const response = await postRegister({ name: ' Fabrizio ', email: ' FABRI@EXAMPLE.COM ', password, role });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      message: 'User registered successfully',
      data: { ...publicUser, created_at: publicUser.created_at.toISOString() }
    });
  }
  assert.notEqual(hashes[0], hashes[1]);
});

test('register maps the unique email violation to 409 without leaking SQL details', async () => {
  mock.method(pool, 'query', async () => {
    throw Object.assign(new Error('Sensitive database details'), { code: '23505', constraint: 'unique_user_email' });
  });
  const response = await postRegister(validBody);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: true, message: 'A user with this email already exists' });
});

test('register hides unexpected database errors behind a generic 500 response', async () => {
  mock.method(pool, 'query', async () => { throw new Error('Sensitive database details'); });
  const response = await postRegister(validBody);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error registering user' });
});

test('register does not insert a user if password hashing fails', async () => {
  const query = mock.method(pool, 'query', async () => { throw new Error('Unexpected query'); });
  mock.method(bcrypt, 'hash', async () => { throw new Error('Sensitive hashing details'); });
  const response = await postRegister(validBody);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: true, message: 'Error registering user' });
  assert.equal(query.mock.callCount(), 0);
});

test('auth router does not implement login or public users endpoints', async () => {
  for (const pathname of ['/auth/login', '/auth/users']) {
    const response = await fetch(`${baseUrl}${pathname}`, { method: 'POST' });
    assert.equal(response.status, 404);
  }
});

import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import pool from '../src/config/db';
import {
  CreateUserInput,
  User,
  createUser,
  findUserByEmail,
  findUserById
} from '../src/models/User';

const input: CreateUserInput = {
  name: "Alex O'Connor",
  email: 'alex@example.com',
  password_hash: 'opaque-precomputed-test-hash',
  role: 'organizer'
};

const user: User = {
  id: 1,
  name: input.name,
  email: input.email,
  role: input.role,
  created_at: new Date('2026-01-01T00:00:00Z')
};

afterEach(() => mock.restoreAll());

test('createUser inserts prepared values with parameters and returns public fields', async () => {
  const query = mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /INSERT INTO users \(name, email, password_hash, role\)/);
    assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
    assert.deepEqual(values, [input.name, input.email, input.password_hash, input.role]);
    assert.ok(!sql.includes(input.name));
    assert.ok(!sql.includes(input.password_hash));
    assert.doesNotMatch(sql.split('RETURNING')[1]!, /password_hash|\*/);
    return { rows: [user] };
  });

  const created = await createUser(input);
  assert.deepEqual(created, user);
  assert.equal('password_hash' in created, false);
  assert.equal(query.mock.callCount(), 1);
});

test('createUser preserves database uniqueness errors for the caller', async () => {
  const error = Object.assign(new Error('Duplicate email'), {
    code: '23505', constraint: 'unique_user_email'
  });
  mock.method(pool, 'query', async () => { throw error; });
  await assert.rejects(createUser(input), (caught) => caught === error);
});

test('findUserByEmail uses a normalized parameterized lookup and returns internal credentials', async () => {
  const email = " ALEX@example.com' OR '1'='1 ";
  const credentials = { ...user, password_hash: input.password_hash };
  mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /SELECT id, name, email, role, created_at, password_hash/);
    assert.match(sql, /LOWER\(BTRIM\(email\)\) = LOWER\(BTRIM\(\$1\)\)/);
    assert.deepEqual(values, [email]);
    assert.ok(!sql.includes(email));
    return { rows: [credentials] };
  });
  assert.deepEqual(await findUserByEmail(email), credentials);
});

test('findUserByEmail returns null when no user exists', async () => {
  mock.method(pool, 'query', async () => ({ rows: [] }));
  assert.equal(await findUserByEmail('missing@example.com'), null);
});

test('findUserById uses a parameter and excludes the password hash', async () => {
  mock.method(pool, 'query', async (sql: string, values: unknown[]) => {
    assert.match(sql, /WHERE id = \$1/);
    assert.doesNotMatch(sql, /password_hash|\*/);
    assert.deepEqual(values, [user.id]);
    return { rows: [user] };
  });
  assert.deepEqual(await findUserById(user.id), user);
});

test('findUserById returns null when no user exists', async () => {
  mock.method(pool, 'query', async () => ({ rows: [] }));
  assert.equal(await findUserById(999), null);
});

test('user lookups propagate database failures without converting them to missing users', async () => {
  const error = new Error('Database unavailable');
  mock.method(pool, 'query', async () => { throw error; });
  await assert.rejects(findUserByEmail(input.email), (caught) => caught === error);
  await assert.rejects(findUserById(user.id), (caught) => caught === error);
});

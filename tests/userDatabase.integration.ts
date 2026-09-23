import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import pool from '../src/config/db';
import { User, createUser, findUserByEmail, findUserById } from '../src/models/User';

const migration = readFileSync(path.join(__dirname, '../src/db/migrations/006_create_users.sql'), 'utf8');
const schemaSql = readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
// Valor opaco de prueba: esta etapa no calcula ni verifica hashes.
const passwordHash = 'opaque-precomputed-test-hash';

for (const source of ['migration', 'schema'] as const) {
  test(`users work with PostgreSQL initialized from ${source}`, async (t) => {
    // Nunca usar la conexion de desarrollo como alternativa a la base de pruebas.
    const connectionString = process.env.USER_TEST_DATABASE_URL;
    assert.ok(connectionString, 'USER_TEST_DATABASE_URL must point to a disposable users_test database');
    const url = new URL(connectionString);
    assert.equal(url.pathname, '/users_test', 'Only the users_test database is allowed');

    const schemaName = `users_test_${randomUUID().replace(/-/g, '')}`;
    const client = new Client({ connectionString });
    await client.connect();
    let created: User;

    try {
      await client.query(`CREATE SCHEMA ${schemaName}`);
      await client.query(`SET search_path TO ${schemaName}`);
      await client.query(source === 'migration' ? migration : schemaSql);
      const queryMock = t.mock.method(pool, 'query', client.query.bind(client));

      await t.test('creates a user with generated ID, timestamp and prepared fields', async () => {
        created = await createUser({
          name: "Alex O'Connor",
          email: 'alex@example.com',
          password_hash: passwordHash,
          role: 'organizer'
        });
        assert.ok(Number.isInteger(created.id) && created.id > 0);
        assert.equal(created.name, "Alex O'Connor");
        assert.equal(created.email, 'alex@example.com');
        assert.equal(created.role, 'organizer');
        assert.ok(created.created_at instanceof Date);
        assert.equal('password_hash' in created, false);
      });

      await t.test('stores the exact supplied hash and finds credentials by normalized email', async () => {
        const stored = await findUserByEmail(' ALEX@EXAMPLE.COM ');
        assert.deepEqual(stored, { ...created, password_hash: passwordHash });
      });

      await t.test('finds public user fields by ID and returns null for missing users', async () => {
        assert.deepEqual(await findUserById(created.id), created);
        assert.equal(await findUserById(2147483647), null);
        assert.equal(await findUserByEmail('missing@example.com'), null);
        assert.equal(await findUserByEmail("' OR '1'='1"), null);
      });

      await t.test('PostgreSQL rejects exact and case-insensitive duplicate emails', async () => {
        for (const email of ['alex@example.com', ' ALEX@example.com ']) {
          await assert.rejects(createUser({
            name: 'Another User', email, password_hash: passwordHash, role: 'organizer'
          }), { code: '23505', constraint: 'unique_user_email' });
        }
      });

      await t.test('PostgreSQL accepts admin and defaults omitted role to organizer', async () => {
        const admin = await createUser({
          name: 'Admin User', email: 'admin@example.com', password_hash: passwordHash, role: 'admin'
        });
        assert.equal(admin.role, 'admin');
        const result = await client.query(
          `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
           RETURNING role, created_at`,
          ['Default User', 'default@example.com', passwordHash]
        );
        assert.equal(result.rows[0].role, 'organizer');
        assert.ok(result.rows[0].created_at instanceof Date);
      });

      await t.test('PostgreSQL rejects an unsupported role', async () => {
        await assert.rejects(client.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          ['Invalid Role', 'invalid@example.com', passwordHash, 'manager']
        ), { code: '23514', constraint: 'chk_user_role' });
      });

      await t.test('PostgreSQL rejects null required fields and blank name, email or hash', async () => {
        const sql = `INSERT INTO users (name, email, password_hash, role, created_at)
                     VALUES ($1, $2, $3, $4, $5)`;
        const valid = ['Test User', 'test@example.com', passwordHash, 'organizer', new Date()];
        for (let index = 0; index < valid.length; index += 1) {
          const values: unknown[] = [...valid];
          values[index] = null;
          await assert.rejects(client.query(sql, values), { code: '23502' });
        }
        for (const [index, constraint] of [
          [0, 'chk_user_name'], [1, 'chk_user_email'], [2, 'chk_user_password_hash']
        ] as const) {
          const values: unknown[] = [...valid];
          values[index] = '   ';
          await assert.rejects(client.query(sql, values), { code: '23514', constraint });
        }
      });

      await t.test('migration can be reapplied without modifying existing records', async () => {
        const before = await client.query('SELECT * FROM users ORDER BY id');
        await client.query(migration);
        const after = await client.query('SELECT * FROM users ORDER BY id');
        assert.deepEqual(after.rows, before.rows);
      });

      queryMock.mock.restore();
    } finally {
      t.mock.restoreAll();
      // El nombre es generado por el test; solo se elimina su esquema aislado.
      try {
        await client.query('ROLLBACK');
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      } finally {
        await client.end();
      }
    }
  });
}

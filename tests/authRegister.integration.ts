import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import bcrypt from 'bcrypt';
import express from 'express';
import { Client, Pool } from 'pg';
import pool from '../src/config/db';
import authRoutes from '../src/routes/authRoutes';

test('register works over HTTP with real PostgreSQL and bcrypt', async (t) => {
  const connectionString = process.env.USER_TEST_DATABASE_URL;
  assert.ok(connectionString, 'USER_TEST_DATABASE_URL must point to a disposable users_test database');
  assert.equal(new URL(connectionString).pathname, '/users_test', 'Only the users_test database is allowed');
  const schemaName = `users_test_${randomUUID().replace(/-/g, '')}`;
  const client = new Client({ connectionString });
  const testPool = new Pool({ connectionString, options: `-c search_path=${schemaName}` });
  let server: Server | undefined;
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA ${schemaName}`);
    await client.query(`SET search_path TO ${schemaName}`);
    await client.query(readFileSync(path.join(__dirname, '../src/db/migrations/006_create_users.sql'), 'utf8'));
    t.mock.method(pool, 'query', testPool.query.bind(testPool));
    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/register`;
    const input = { name: ' Fabrizio ', email: ' FABRI@EXAMPLE.COM ', password: 'ClaveSegura123' };
    const post = (body: unknown) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });

    await t.test('creates a normalized organizer and stores only a verifiable hash', async () => {
      const response = await post(input);
      assert.equal(response.status, 201);
      const body = await response.json() as { data: Record<string, unknown> };
      assert.deepEqual(Object.keys(body.data).sort(), ['created_at', 'email', 'id', 'name', 'role']);
      assert.equal(body.data.name, 'Fabrizio');
      assert.equal(body.data.email, 'fabri@example.com');
      assert.equal(body.data.role, 'organizer');
      const stored = (await client.query('SELECT * FROM users WHERE id = $1', [body.data.id])).rows[0];
      assert.equal(await bcrypt.compare(input.password, stored.password_hash), true);
      assert.notEqual(stored.password_hash, input.password);
    });

    await t.test('rejects duplicate email regardless of case and surrounding spaces', async () => {
      for (const email of ['fabri@example.com', ' FABRI@example.COM ']) {
        const response = await post({ ...input, email });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: true, message: 'A user with this email already exists' });
      }
      assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 1);
    });

    await t.test('two simultaneous registrations create exactly one user', async () => {
      const responses = await Promise.all([
        post({ ...input, email: 'race@example.com' }),
        post({ ...input, email: ' RACE@EXAMPLE.COM ' })
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      for (const response of responses) await response.json();
      const result = await client.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', ['race@example.com']);
      assert.equal(result.rows[0].count, 1);
    });

    await t.test('invalid data and admin self-registration leave the database unchanged', async () => {
      const before = (await client.query('SELECT * FROM users ORDER BY id')).rows;
      for (const extra of [{ role: 'admin' }, { password: 'short' }, { email: 'invalid' }, { password_hash: 'injected' }]) {
        const response = await post({ ...input, ...extra });
        assert.equal(response.status, 400);
        await response.json();
      }
      assert.deepEqual((await client.query('SELECT * FROM users ORDER BY id')).rows, before);
    });
  } finally {
    if (server) {
      const runningServer = server;
      await new Promise<void>((resolve, reject) => {
        runningServer.close((error) => error ? reject(error) : resolve());
        runningServer.closeAllConnections();
      });
    }
    t.mock.restoreAll();
    await testPool.end();
    try {
      await client.query('ROLLBACK');
      // El esquema tiene un nombre generado; nunca se eliminan datos de desarrollo.
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } finally {
      await client.end();
    }
  }
});

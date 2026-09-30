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
import { Client } from 'pg';
import pool from '../src/config/db';
import authRoutes from '../src/routes/authRoutes';

test('register followed by login works with real PostgreSQL and bcrypt without changing stored users', async (t) => {
  const connectionString = process.env.USER_TEST_DATABASE_URL;
  assert.ok(connectionString, 'USER_TEST_DATABASE_URL must point to a disposable users_test database');
  assert.equal(new URL(connectionString).pathname, '/users_test', 'Only the users_test database is allowed');
  const schemaName = `users_test_${randomUUID().replace(/-/g, '')}`;
  const client = new Client({ connectionString });
  let server: Server | undefined;
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA ${schemaName}`);
    await client.query(`SET search_path TO ${schemaName}`);
    await client.query(readFileSync(path.join(__dirname, '../src/db/migrations/006_create_users.sql'), 'utf8'));
    t.mock.method(pool, 'query', client.query.bind(client));
    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const input = { name: 'Fabrizio', email: 'fabri@example.com', password: 'ClaveSegura123' };
    const post = (route: string, body: unknown) => fetch(`${baseUrl}/auth/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const registration = await post('register', input);
    assert.equal(registration.status, 201);
    const created = await registration.json() as { data: Record<string, unknown> };
    const storedBefore = (await client.query('SELECT * FROM users ORDER BY id')).rows;
    const stored = storedBefore[0];

    await t.test('stored register hash verifies the original password and login succeeds', async () => {
      assert.notEqual(stored.password_hash, input.password);
      assert.equal(await bcrypt.compare(input.password, stored.password_hash), true);
      const response = await post('login', { email: input.email, password: input.password });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.deepEqual(await response.json(), { message: 'Login successful', data: created.data });
      assert.deepEqual(Object.keys(created.data).sort(), ['created_at', 'email', 'id', 'name', 'role']);
    });

    await t.test('login normalizes email case and surrounding spaces', async () => {
      const response = await post('login', { email: ' FABRI@EXAMPLE.COM ', password: input.password });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { message: 'Login successful', data: created.data });
    });

    await t.test('bcrypt rejects incorrect passwords and both credential failures produce the same 401', async () => {
      assert.equal(await bcrypt.compare('wrong', stored.password_hash), false);
      for (const body of [
        { email: input.email, password: 'wrong' },
        { email: 'missing@example.com', password: input.password }
      ]) {
        const response = await post('login', body);
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: true, message: 'Invalid credentials' });
      }
    });

    await t.test('invalid input returns 400', async () => {
      for (const body of [{ email: input.email }, { email: 'invalid', password: input.password },
        { email: input.email, password: 12345678 }]) {
        const response = await post('login', body);
        assert.equal(response.status, 400);
        await response.json();
      }
    });

    await t.test('successful and failed logins preserve every stored user field including the hash', async () => {
      assert.deepEqual((await client.query('SELECT * FROM users ORDER BY id')).rows, storedBefore);
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
    try {
      await client.query('ROLLBACK');
      // Solo se elimina el esquema temporal creado por esta prueba.
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } finally {
      await client.end();
    }
  }
});

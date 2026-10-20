import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { after, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import pool from '../src/config/db';
import {
  TEAM_LOGO_MAX_BYTES,
  detectTeamLogoMimeType,
  validateTeamLogo
} from '../src/controllers/teamcontroller';
import teamRoutes from '../src/routes/teamroutes';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
const webp = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary');

let logo: { data: Buffer; mimeType: string } | null;
let teamExists: boolean;
let commands: string[];

const app = express();
app.use('/api/teams', teamRoutes);
const server = app.listen(0, '127.0.0.1');
let baseUrl: string;

before(async () => {
  if (!server.listening) await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.method(pool, 'query', async (queryText: string, values: unknown[] = []) => {
    const sql = queryText.replace(/\s+/g, ' ').trim();
    commands.push(sql);
    if (sql.includes('FROM teams') && sql.includes('ORDER BY id ASC')) {
      return { rows: teamExists ? [{
        id: 1, tournament_id: 7, name: 'Equipo Alfa', players_count: 7,
        has_logo: logo !== null, created_at: new Date('2026-01-01T00:00:00Z')
      }] : [] };
    }
    if (sql.startsWith('SELECT logo_data')) {
      return { rows: teamExists && logo ? [{ logo_data: logo.data, logo_mime_type: logo.mimeType }] : [] };
    }
    if (sql.includes('SET logo_data = $1')) {
      if (teamExists) logo = { data: values[0] as Buffer, mimeType: values[1] as string };
      return { rows: teamExists ? [{ id: 1 }] : [], rowCount: teamExists ? 1 : 0 };
    }
    if (sql.includes('SET logo_data = NULL')) {
      if (teamExists) logo = null;
      return { rows: teamExists ? [{ id: 1 }] : [], rowCount: teamExists ? 1 : 0 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

after(async () => {
  mock.restoreAll();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

beforeEach(() => {
  logo = null;
  teamExists = true;
  commands = [];
});

test('detects the supported binary signatures rather than trusting a filename', () => {
  assert.equal(detectTeamLogoMimeType(png), 'image/png');
  assert.equal(detectTeamLogoMimeType(jpeg), 'image/jpeg');
  assert.equal(detectTeamLogoMimeType(webp), 'image/webp');
  assert.equal(detectTeamLogoMimeType(Buffer.from('fake image')), null);
});

test('validates declared MIME, real signature and the 1 MB boundary', () => {
  assert.equal(validateTeamLogo(png, 'image/png').mimeType, 'image/png');
  assert.equal(validateTeamLogo(png, 'image/jpeg').status, 415);
  assert.equal(validateTeamLogo(Buffer.alloc(0), 'image/png').status, 400);
  assert.equal(validateTeamLogo(Buffer.alloc(TEAM_LOGO_MAX_BYTES + 1), 'image/png').status, 413);
});

test('uploads, reads and deletes a logo without checking tournament status', async () => {
  const upload = await fetch(`${baseUrl}/api/teams/1/logo`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png
  });
  assert.equal(upload.status, 200);
  assert.deepEqual(await upload.json(), {
    message: 'Team logo updated successfully', data: { team_id: 1, has_logo: true }
  });
  const read = await fetch(`${baseUrl}/api/teams/1/logo`);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);
  const remove = await fetch(`${baseUrl}/api/teams/1/logo`, { method: 'DELETE' });
  assert.equal(remove.status, 200);
  assert.equal(logo, null);
  assert.ok(commands.every(sql => !sql.includes('FROM tournaments')));
});

test('rejects invalid IDs, spoofed files and oversized bodies before database access', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '2147483648']) {
    const response = await fetch(`${baseUrl}/api/teams/${id}/logo`);
    assert.equal(response.status, 400);
  }
  const spoofed = await fetch(`${baseUrl}/api/teams/1/logo`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('not png')
  });
  assert.equal(spoofed.status, 415);
  const unsupported = await fetch(`${baseUrl}/api/teams/1/logo`, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: png
  });
  assert.equal(unsupported.status, 415);
  const oversized = await fetch(`${baseUrl}/api/teams/1/logo`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' },
    body: Buffer.alloc(TEAM_LOGO_MAX_BYTES + 1)
  });
  assert.equal(oversized.status, 413);
  assert.equal(commands.length, 0);
});

test('returns 404 for missing teams or logos', async () => {
  assert.equal((await fetch(`${baseUrl}/api/teams/1/logo`)).status, 404);
  teamExists = false;
  const upload = await fetch(`${baseUrl}/api/teams/1/logo`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png
  });
  assert.equal(upload.status, 404);
  assert.equal((await fetch(`${baseUrl}/api/teams/1/logo`, { method: 'DELETE' })).status, 404);
});

test('team list exposes has_logo but never binary columns', async () => {
  logo = { data: png, mimeType: 'image/png' };
  const response = await fetch(`${baseUrl}/api/teams`);
  const body = await response.json() as { data: Record<string, unknown>[] };
  assert.equal(response.status, 200);
  assert.equal(body.data[0]?.has_logo, true);
  assert.equal('logo_data' in body.data[0]!, false);
  assert.equal('logo_mime_type' in body.data[0]!, false);
});

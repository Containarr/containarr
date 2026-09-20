import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import Traffic from '../lib/Traffic.mjs';
import TrafficRequest from '../lib/SQLite/TrafficRequest.mjs';

let directory, sequelize, sqlite, traffic, Request;
const sample = {
  StartUTC: '2026-09-20T12:00:00.123456789Z', RequestMethod: 'GET',
  RequestHost: 'plex.mydomain.com', RequestPath: '/library?token=secret',
  ClientHost: '192.0.2.10', DownstreamStatus: 200, Duration: 12_345_678, DownstreamContentSize: 2048,
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'containarr-traffic-'));
  sequelize = new Sequelize({ dialect: SqliteDialect, storage: join(directory, 'db.sqlite'), logging: false, pool: { max: 1 } });
  Request = sequelize.define('TrafficRequest', TrafficRequest, { timestamps: false });
  await sequelize.sync();
  sqlite = { sequelize: Promise.resolve(sequelize), getModel: async () => Request };
  traffic = new Traffic({ sqlite });
  clearInterval(traffic.flushInterval);
  await traffic.ready;
});

afterEach(async () => {
  await traffic.operation.catch(() => {});
  await sequelize.close();
  await rm(directory, { recursive: true, force: true });
});

test('parses request metadata, converts nanoseconds, and excludes credentials', async () => {
  assert.equal(traffic.record(JSON.stringify({ ...sample, Authorization: 'secret', ClientUsername: 'admin', request_Cookie: 'secret' })), true);
  const { requests, total } = await traffic.list();
  assert.equal(total, 1);
  assert.deepEqual(requests[0].toJSON(), {
    id: 1, startedAt: new Date('2026-09-20T12:00:00.123Z'), method: 'GET', host: 'plex.mydomain.com',
    path: '/library', clientIp: '192.0.2.10', status: 200, durationMs: 12.345678, bytes: 2048,
  });
  for (const line of ['not JSON', 'null', '{}', '{', JSON.stringify({ ...sample, StartUTC: 'bad date' }), JSON.stringify({ ...sample, DownstreamStatus: '200' })]) {
    assert.equal(traffic.record(line), false);
  }
  assert.equal((await traffic.list()).total, 1);
});

test('excludes web UI API calls only when routed to Containarr', async () => {
  for (const RequestHost of ['containarr.mydomain.com', 'localhost', '192.168.1.10']) {
    for (const RequestPath of ['/api', '/api?test=1', '/api/v1/traffic?page=1', '/api/v1/app']) {
      for (const RequestMethod of ['GET', 'POST', 'DELETE']) {
        assert.equal(traffic.record(JSON.stringify({
          ...sample, RequestHost, RequestPath, RequestMethod,
          ServiceName: 'containarr@http', 'request_X-Containarr-Client': 'web-ui',
        })), true);
      }
    }
  }
  assert.equal(traffic.pending.size, 0);
  assert.equal((await traffic.list()).total, 0);

  for (const entry of [
    { ServiceName: 'app-plex@http', RequestPath: '/api/v1/traffic', 'request_X-Containarr-Client': 'web-ui' },
    { ServiceName: 'containarr@http', RequestPath: '/api/v1/traffic' },
    { ServiceName: 'containarr@http', RequestPath: '/api/v1/traffic', 'request_X-Containarr-Client': 'external' },
    { ServiceName: 'containarr@http', RequestPath: '/', 'request_X-Containarr-Client': 'web-ui' },
    { ServiceName: 'containarr@http', RequestPath: '/api-docs', 'request_X-Containarr-Client': 'web-ui' },
    { RequestPath: '/api/v1/traffic', 'request_X-Containarr-Client': 'web-ui' },
  ]) traffic.record(JSON.stringify({ ...sample, ...entry }));
  assert.equal((await traffic.list()).total, 6);
});

test('keeps exactly the newest 100,000 requests across batches and paginates them', async () => {
  // Populate the retention boundary efficiently in a real SQLite database.
  await sequelize.query(`WITH RECURSIVE entries(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM entries WHERE n < 100000)
    INSERT INTO "TrafficRequests" ("startedAt", "method", "host", "path", "clientIp", "status", "durationMs", "bytes")
    SELECT '2026-09-20 12:00:00.000 +00:00', 'GET', 'mydomain.com', '/' || n, '192.0.2.10', 200, 1, 10 FROM entries`);
  for (let index = 0; index < 75; index++) traffic.record(JSON.stringify({ ...sample, RequestPath: `/new/${index}` }));
  const first = await traffic.list();
  assert.equal(first.total, 100_000);
  assert.equal(first.requests.length, 50);
  assert.equal(first.requests[0].path, '/new/74');
  assert.equal(first.requests[49].path, '/new/25');
  const second = await traffic.list({ page: 2 });
  assert.equal(second.requests[0].path, '/new/24');
  const last = await traffic.list({ page: 2000 });
  assert.equal(last.requests[49].path, '/76');
  for (const page of [0, -1, 1.5, NaN, Infinity, 2001]) {
    await assert.rejects(traffic.list({ page }), { statusCode: 400 });
  }
});

test('clear removes stored and buffered requests without resurrecting an in-flight batch', async () => {
  traffic.record(JSON.stringify(sample));
  await traffic.flush();
  traffic.record(JSON.stringify({ ...sample, RequestPath: '/in-flight' }));
  const flushing = traffic.flush();
  traffic.record(JSON.stringify({ ...sample, RequestPath: '/buffered' }));
  const clearing = traffic.clear();
  await Promise.all([flushing, clearing]);
  assert.equal((await traffic.list()).total, 0);
  traffic.record(JSON.stringify({ ...sample, RequestPath: '/after-clear' }));
  const result = await traffic.list();
  assert.equal(result.total, 1);
  assert.equal(result.requests[0].path, '/after-clear');
});

test('new requests received while clearing are kept after the clear finishes', async () => {
  traffic.record(JSON.stringify(sample));
  const flushing = traffic.flush();
  const clearing = traffic.clear();
  traffic.record(JSON.stringify({ ...sample, RequestPath: '/after-clear' }));
  await Promise.all([flushing, clearing]);
  const result = await traffic.list();
  assert.equal(result.total, 1);
  assert.equal(result.requests[0].path, '/after-clear');
});

test('failed writes are retried and a clear discards a failed batch', async () => {
  const bulkCreate = Request.bulkCreate;
  Request.bulkCreate = async () => { throw new Error('write failed'); };
  traffic.record(JSON.stringify(sample));
  await assert.rejects(traffic.flush(), /write failed/);
  Request.bulkCreate = bulkCreate;
  assert.equal((await traffic.list()).total, 1);
  Request.bulkCreate = async () => { throw new Error('write failed'); };
  traffic.record(JSON.stringify(sample));
  const flushing = traffic.flush();
  const clearing = traffic.clear();
  await assert.rejects(flushing, /write failed/);
  await clearing;
  Request.bulkCreate = bulkCreate;
  assert.equal((await traffic.list()).total, 0);
});

test('pending requests stay bounded and retain the newest entries', () => {
  for (let index = 0; index < 100_010; index++) {
    traffic.record(JSON.stringify({ ...sample, RequestPath: `/${index}` }));
  }
  assert.equal(traffic.pending.size, 100_000);
  assert.equal(traffic.pending.values().next().value.path, '/10');
});

test('logs survive reopening the database', async () => {
  traffic.record(JSON.stringify(sample));
  await traffic.flush();
  await sequelize.close();
  sequelize = new Sequelize({ dialect: SqliteDialect, storage: join(directory, 'db.sqlite'), logging: false, pool: { max: 1 } });
  Request = sequelize.define('TrafficRequest', TrafficRequest, { timestamps: false });
  traffic = new Traffic({ sqlite: { sequelize: Promise.resolve(sequelize), getModel: async () => Request } });
  clearInterval(traffic.flushInterval);
  const result = await traffic.list();
  assert.equal(result.total, 1);
  assert.equal(result.requests[0].path, '/library');
});

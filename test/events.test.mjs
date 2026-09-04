import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import Events from '../lib/Events.mjs';
import App from '../lib/SQLite/App.mjs';
import Event from '../lib/SQLite/Event.mjs';
import EventAppState from '../lib/SQLite/EventAppState.mjs';
import PushDevice from '../lib/SQLite/PushDevice.mjs';
import Webhook from '../lib/SQLite/Webhook.mjs';
import Setting from '../lib/SQLite/Setting.mjs';

let directory, sequelize, sqlite, events;
const instances = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'containarr-events-'));
  sequelize = new Sequelize({ dialect: SqliteDialect, storage: join(directory, 'db.sqlite'), logging: false, pool: { max: 1 } });
  for (const [name, schema] of Object.entries({ App, Event, EventAppState, PushDevice, Webhook, Setting })) sequelize.define(name, schema);
  await sequelize.sync();
  sqlite = { sequelize: Promise.resolve(sequelize), getModel: async name => sequelize.models.get(name) };
  events = new Events({ sqlite, version: '1.0.0' });
  instances.push(events);
  await events.ready;
});

afterEach(async () => {
  for (const instance of instances.splice(0)) {
    clearInterval(instance.cleanupInterval);
    await instance.ready;
    await instance.delivery;
  }
  await sequelize.close();
  await rm(directory, { recursive: true, force: true });
});

test('short outages are silent; sustained outages and recovery are recorded once', async () => {
  const start = Date.now() - 600_000;
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start + 299_999) });
  assert.equal((await events.list()).total, 0);
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: true, now: new Date(start + 299_999) });
  assert.equal((await events.list()).total, 0);
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start + 300_000) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start + 600_000) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start + 601_000) });
  assert.equal((await events.list()).total, 1);
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: true, now: new Date(start + 610_000) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: true, now: new Date(start + 620_000) });
  const result = await events.list();
  assert.deepEqual(result.events.map(event => event.eventName), ['app.online', 'app.offline']);
  assert.equal(result.events[0].details.durationSeconds, 310);
});

test('disabled apps do not generate outages or recovery events', async () => {
  const start = Date.now() - 600_000;
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, now: new Date(start) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: false, disabled: true, now: new Date(start + 300_000) });
  await events.observeApp({ appId: 'plex', appName: 'Plex', online: true });
  assert.equal((await events.list()).total, 0);
});

test('restart preserves outage tracking, VAPID keys and update deduplication', async () => {
  const start = new Date(Date.now() - 300_000);
  await events.observeApp({ appId: 'immich', appName: 'Immich', online: false, now: start });
  const values = { eventName: 'app.update_available', message: 'Immich has an update available.', appId: 'immich' };
  await events.record(values, { key: 'events.app-update.immich', value: 'sha256:first' });
  const restarted = new Events({ sqlite, version: '1.0.0' });
  instances.push(restarted);
  await restarted.ready;
  assert.deepEqual(restarted.vapidDetails, events.vapidDetails);
  await restarted.record(values, { key: 'events.app-update.immich', value: 'sha256:first' });
  await restarted.observeApp({ appId: 'immich', appName: 'Immich', online: false });
  assert.equal((await restarted.list()).total, 2);
  await restarted.record(values, { key: 'events.app-update.immich', value: 'sha256:second' });
  assert.equal((await restarted.list()).total, 3);
});

test('Containarr updates are recorded on version change, not first run or ordinary restart', async () => {
  assert.equal((await events.list()).total, 0);
  const upgraded = new Events({ sqlite, version: '1.2.3' });
  instances.push(upgraded);
  await upgraded.ready;
  const result = await upgraded.list();
  assert.equal(result.total, 1);
  assert.equal(result.events[0].message, 'Containarr has been updated to v1.2.3.');
  assert.deepEqual(result.events[0].details, { version: '1.2.3', previousVersion: '1.0.0' });
  const restarted = new Events({ sqlite, version: '1.2.3' });
  instances.push(restarted);
  await restarted.ready;
  assert.equal((await restarted.list()).total, 1);
});

test('events older than 31 days are hidden and pruned on startup; history is paginated', async () => {
  await events.Event.create({ eventName: 'app.updated', message: 'Old event', createdAt: new Date(Date.now() - 32 * 86_400_000) });
  await events.Event.create({ eventName: 'app.updated', message: 'Retained for the extra day', createdAt: new Date(Date.now() - 30.5 * 86_400_000) });
  for (let i = 0; i < 52; i++) await events.Event.create({ eventName: 'app.updated', message: `Event ${i}`, createdAt: new Date(Date.now() - (52 - i) * 1000) });
  const first = await events.list();
  assert.equal(first.total, 53);
  assert.equal(first.events.length, 50);
  assert.equal(first.events[0].message, 'Event 51');
  const second = await events.list({ page: 2 });
  assert.equal(second.events.length, 3);
  assert.equal(second.events[2].message, 'Retained for the extra day');
  const restarted = new Events({ sqlite, version: '1.0.0' });
  instances.push(restarted);
  await restarted.ready;
  assert.equal(await events.Event.count(), 53);
});

test('event sorting applies to the complete history before pagination', async () => {
  const now = Date.now();
  await events.Event.bulkCreate(Array.from({ length: 55 }, (_, index) => ({
    eventName: 'app.updated', message: `${index % 2 ? 'event' : 'Event'} ${String(index).padStart(2, '0')}`,
    appName: index === 0 ? null : index === 1 ? 'immich' : 'Plex',
    createdAt: new Date(now - index * 1000),
  })));
  const ascending = await events.list({ sortBy: 'message', direction: 'asc' });
  const second = await events.list({ sortBy: 'message', direction: 'asc', page: 2 });
  assert.equal(ascending.events[0].message, 'Event 00');
  assert.equal(ascending.events[49].message, 'event 49');
  assert.equal(second.events[0].message, 'Event 50');
  assert.equal(second.events[4].message, 'Event 54');
  assert.equal(second.total, 55);
  assert.equal((await events.list({ sortBy: 'message', direction: 'desc' })).events[0].message, 'Event 54');
  assert.equal((await events.list({ sortBy: 'createdAt', direction: 'asc' })).events[0].message, 'Event 54');
  assert.equal((await events.list({ sortBy: 'createdAt', direction: 'desc' })).events[0].message, 'Event 00');
  const apps = await events.list({ sortBy: 'appName', direction: 'asc' });
  assert.equal(apps.events[0].appName, null); // Displayed as Containarr, ahead of Immich and Plex.
  assert.equal(apps.events[1].appName, 'immich');
  assert.equal((await events.list({ sortBy: 'appName', direction: 'desc' })).events[0].appName, 'Plex');
});

test('event sorting rejects unsupported columns and directions', async () => {
  await assert.rejects(events.list({ sortBy: 'unknown' }), { statusCode: 400 });
  await assert.rejects(events.list({ sortBy: ['createdAt'] }), { statusCode: 400 });
  await assert.rejects(events.list({ direction: 'invalid' }), { statusCode: 400 });
});

test('webhooks and push receive matching event IDs and JSON; one failure does not block others', async () => {
  const deliveries = [];
  events.request = async (url, options) => {
    deliveries.push({ url, options });
    return new Response(null, { status: url.endsWith('/fail') ? 500 : 204 });
  };
  events.sendPush = async (subscription, payload, options) => {
    deliveries.push({ subscription, payload, options });
  };
  await events.Webhook.create({ name: 'Fail', url: 'https://example.com/fail' });
  await events.Webhook.create({ name: 'OK', url: 'https://example.com/ok' });
  await events.PushDevice.create({ name: 'iPhone', endpoint: 'https://push.example.com', subscription: { endpoint: 'https://push.example.com' } });
  const record = await events.record({ eventName: 'app.updated', message: 'Plex has been updated.', appId: 'plex', appName: 'Plex', details: { imageId: 'sha256:new' } });
  await events.delivery;
  assert.equal(deliveries.length, 3);
  for (const delivery of deliveries) {
    const payload = JSON.parse(delivery.payload ?? delivery.options.body);
    assert.equal(payload.eventId, record.id);
    assert.equal(payload.eventName, 'app.updated');
    assert.equal(payload.appId, 'plex');
    assert.equal(payload.details.imageId, 'sha256:new');
    if (delivery.url) {
      assert.equal(delivery.options.method, 'POST');
      assert.equal(delivery.options.headers['Content-Type'], 'application/json');
      assert.equal(delivery.options.headers['User-Agent'], 'Containarr v1.0.0');
      assert.equal(delivery.options.redirect, 'manual');
    }
  }
  assert.equal((await events.Webhook.findOne({ where: { name: 'Fail' } })).lastError, 'HTTP 500');
  assert.ok((await events.Webhook.findOne({ where: { name: 'OK' } })).lastSentAt);
  assert.ok((await events.PushDevice.findOne()).lastSentAt);
});

test('expired push devices are removed, temporary failures are retained', async () => {
  events.sendPush = async subscription => { throw Object.assign(new Error('provider failure'), { statusCode: subscription.statusCode }); };
  await events.PushDevice.create({ name: 'Expired', endpoint: 'https://push.example.com/expired', subscription: { statusCode: 410 } });
  await events.PushDevice.create({ name: 'Temporary', endpoint: 'https://push.example.com/temporary', subscription: { statusCode: 503 } });
  await events.record({ eventName: 'containarr.update_available', message: 'Containarr has an update available.' });
  await events.delivery;
  const devices = await events.PushDevice.findAll();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'Temporary');
  assert.equal(devices[0].lastError, 'HTTP 503');
});

test('test events reach only the selected destination and leave event history unchanged', async () => {
  const deliveries = [];
  events.request = async (url, options) => {
    deliveries.push({ url, options, payload: JSON.parse(options.body) });
    return new Response(null, { status: 204 });
  };
  events.sendPush = async (subscription, payload) => deliveries.push({ subscription, payload: JSON.parse(payload) });
  const webhook = await events.Webhook.create({ name: 'Selected webhook', url: 'https://example.com/selected', lastError: 'HTTP 500' });
  await events.Webhook.create({ name: 'Other webhook', url: 'https://example.com/other' });
  const device = await events.PushDevice.create({ name: 'Selected device', endpoint: 'https://push.example.com/selected', subscription: { endpoint: 'https://push.example.com/selected' } });
  await events.PushDevice.create({ name: 'Other device', endpoint: 'https://push.example.com/other', subscription: {} });

  await events.sendTest({ kind: 'webhook', id: webhook.id });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].url, webhook.url);
  assert.equal(deliveries[0].options.method, 'POST');
  assert.equal(deliveries[0].options.headers['Content-Type'], 'application/json');
  assert.equal(deliveries[0].options.headers['User-Agent'], 'Containarr v1.0.0');
  assert.equal(deliveries[0].options.redirect, 'manual');
  await events.sendTest({ kind: 'device', id: device.id });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[1].subscription.endpoint, device.endpoint);
  for (const { payload } of deliveries) {
    assert.equal(payload.eventName, 'containarr.test');
    assert.equal(payload.details.test, true);
    assert.equal(payload.appId, null);
    assert.ok(payload.eventId);
    assert.ok(Number.isFinite(Date.parse(payload.eventAt)));
  }
  assert.notEqual(deliveries[0].payload.eventId, deliveries[1].payload.eventId);
  await webhook.reload();
  await device.reload();
  assert.ok(webhook.lastSentAt);
  assert.equal(webhook.lastError, null);
  assert.ok(device.lastSentAt);
  assert.equal((await events.list()).total, 0);
});

test('test delivery failures reach the caller and update or expire the selected destination', async () => {
  events.request = async () => new Response(null, { status: 500 });
  const webhook = await events.Webhook.create({ name: 'Failing webhook', url: 'https://example.com/fail' });
  await assert.rejects(events.sendTest({ kind: 'webhook', id: webhook.id }), { statusCode: 502, message: 'Test event failed: HTTP 500' });
  await webhook.reload();
  assert.equal(webhook.lastError, 'HTTP 500');
  assert.equal(webhook.lastSentAt, null);

  const device = await events.PushDevice.create({ name: 'Expired device', endpoint: 'https://push.example.com/expired', subscription: {} });
  events.sendPush = async () => { throw Object.assign(new Error('private provider response'), { statusCode: 410 }); };
  await assert.rejects(events.sendTest({ kind: 'device', id: device.id }), { statusCode: 410, message: 'This push registration has expired. Register the device again.' });
  assert.equal(await events.PushDevice.findByPk(device.id), null);
  await assert.rejects(events.sendTest({ kind: 'device', id: 'missing' }), { statusCode: 404 });
  await assert.rejects(events.sendTest({ kind: 'invalid', id: webhook.id }), { statusCode: 400 });
});

test('debug events persist each sample and notify all destinations without changing monitoring state', async () => {
  const App = await sqlite.getModel('App');
  const app = await App.create({ name: 'My Jellyfin', subdomain: 'jellyfin', dockerImage: 'jellyfin/jellyfin:latest', createdAt: new Date('2026-01-01') });
  await App.create({ name: 'Plex', subdomain: 'plex', dockerImage: 'plexinc/pms-docker:latest', createdAt: new Date('2026-02-01') });
  const appsBefore = await App.findAll({ raw: true });
  const debugLog = await events.list({ dev: true });
  assert.deepEqual(debugLog.debugApp.toJSON(), { id: app.id, name: app.name });
  assert.equal('debugApp' in await events.list(), false);
  const deliveries = [];
  events.request = async (url, options) => {
    deliveries.push({ destination: url, payload: JSON.parse(options.body) });
    return new Response(null, { status: 204 });
  };
  events.sendPush = async (subscription, payload) => deliveries.push({ destination: subscription.endpoint, payload: JSON.parse(payload) });
  await events.Webhook.create({ name: 'Webhook one', url: 'https://example.com/one' });
  await events.Webhook.create({ name: 'Webhook two', url: 'https://example.com/two' });
  await events.PushDevice.create({ name: 'Device', endpoint: 'https://push.example.com', subscription: { endpoint: 'https://push.example.com' } });
  await events.AppState.create({ appId: 'real-app', offlineSince: new Date(), notified: true });
  const settingsBefore = await events.Setting.findAll({ raw: true });
  const statesBefore = await events.AppState.findAll({ raw: true });
  for (const eventName of ['app.update_available', 'app.updated', 'app.offline', 'app.online', 'containarr.update_available', 'containarr.updated']) {
    const event = await events.createDebugEvent(eventName);
    if (eventName.startsWith('app.')) {
      assert.equal(event.appId, app.id);
      assert.equal(event.appName, app.name);
      assert.ok(event.message.startsWith(`${app.name} `));
      if (eventName.startsWith('app.update')) assert.equal(event.details.dockerImage, app.dockerImage);
    }
    await events.delivery;
    const sent = deliveries.filter(delivery => delivery.payload.eventId === event.id);
    assert.equal(sent.length, 3);
    for (const { payload } of sent) {
      assert.equal(payload.eventName, eventName);
      assert.equal(payload.details.test, true);
      assert.equal(payload.message, event.message);
      assert.equal(payload.appId, event.appId);
      assert.equal(payload.appName, event.appName);
    }
  }
  assert.equal((await events.list()).total, 6);
  assert.deepEqual(await events.Setting.findAll({ raw: true }), settingsBefore);
  assert.deepEqual(await events.AppState.findAll({ raw: true }), statesBefore);
  assert.deepEqual(await App.findAll({ raw: true }), appsBefore);
  const repeat = await events.createDebugEvent('app.updated');
  assert.ok(repeat.id);
  assert.equal((await events.list()).total, 7);
});

test('without installed apps, debug app selection is empty and only Containarr test events can be created', async () => {
  assert.equal((await events.list({ dev: true })).debugApp, null);
  for (const eventName of ['app.update_available', 'app.updated', 'app.offline', 'app.online']) {
    await assert.rejects(events.createDebugEvent(eventName), { statusCode: 400 });
  }
  assert.equal((await events.list()).total, 0);
  for (const eventName of ['containarr.update_available', 'containarr.updated']) {
    const event = await events.createDebugEvent(eventName);
    assert.equal(event.appId, null);
    assert.equal(event.details.test, true);
  }
  assert.equal((await events.list()).total, 2);
});

test('debug events reject unsupported event types without creating or sending an event', async () => {
  events.request = async () => assert.fail('Unexpected webhook delivery');
  events.sendPush = async () => assert.fail('Unexpected push delivery');
  for (const eventName of [undefined, null, {}, '__proto__', 'app.deleted', 'containarr.test']) {
    await assert.rejects(events.createDebugEvent(eventName), { statusCode: 400 });
  }
  assert.equal((await events.list()).total, 0);
});

for (const mode of ['regular', 'test']) {
  test(`${mode} webhooks follow three redirects with the same JSON POST and timeout signal`, async () => {
    const webhook = await events.Webhook.create({ name: 'Redirects', url: 'https://example.com/start' });
    const requests = [];
    let cancelled = 0;
    events.request = async (url, options) => {
      requests.push({ url, options });
      const redirect = [
        { status: 301, location: '/second' },
        { status: 307, location: 'third' },
        { status: 308, location: 'https://destination.example.com/final#ignored' },
      ][requests.length - 1];
      return redirect
        ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: redirect.status, headers: { Location: redirect.location } })
        : new Response(null, { status: 204 });
    };
    if (mode === 'test') await events.sendTest({ kind: 'webhook', id: webhook.id });
    else {
      await events.record({ eventName: 'app.updated', message: 'Plex has been updated.' });
      await events.delivery;
    }
    assert.deepEqual(requests.map(request => request.url), [
      'https://example.com/start', 'https://example.com/second',
      'https://example.com/third', 'https://destination.example.com/final',
    ]);
    assert.equal(cancelled, 3);
    for (const { options } of requests) {
      assert.equal(options.method, 'POST');
      assert.equal(options.body, requests[0].options.body);
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal(options.headers['User-Agent'], 'Containarr v1.0.0');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.signal, requests[0].options.signal);
    }
    await webhook.reload();
    assert.ok(webhook.lastSentAt);
    assert.equal(webhook.lastError, null);
  });

  test(`${mode} webhooks stop before following a fourth redirect`, async () => {
    const webhook = await events.Webhook.create({ name: 'Loop', url: 'https://example.com/loop' });
    let requests = 0;
    events.request = async () => {
      requests++;
      return new Response(null, { status: requests % 2 ? 302 : 303, headers: { Location: '/loop' } });
    };
    if (mode === 'test') {
      await assert.rejects(events.sendTest({ kind: 'webhook', id: webhook.id }), {
        statusCode: 502, message: 'Test event failed: Too many webhook redirects (maximum 3).',
      });
    } else {
      await events.record({ eventName: 'app.updated', message: 'Plex has been updated.' });
      await events.delivery;
    }
    assert.equal(requests, 4);
    await webhook.reload();
    assert.equal(webhook.lastSentAt, null);
    assert.equal(webhook.lastError, 'Too many webhook redirects (maximum 3).');
  });

  test(`${mode} webhooks reject redirects with invalid schemes, credentials or missing locations`, async () => {
    const webhook = await events.Webhook.create({ name: 'Invalid redirect', url: 'https://example.com/start' });
    for (const location of ['file:///etc/passwd', 'https://user:password@example.com', 'http://[invalid', null]) {
      let requests = 0;
      events.request = async () => {
        requests++;
        return new Response(null, { status: 302, headers: location ? { Location: location } : {} });
      };
      if (mode === 'test') await assert.rejects(events.sendTest({ kind: 'webhook', id: webhook.id }), { statusCode: 502 });
      else {
        await events.record({ eventName: 'app.updated', message: 'Plex has been updated.' });
        await events.delivery;
      }
      assert.equal(requests, 1);
      await webhook.reload();
      assert.ok(webhook.lastError);
      assert.equal(webhook.lastSentAt, null);
    }
  });
}

import debug from 'debug';
import { randomUUID } from 'node:crypto';
import { Op, sql } from '@sequelize/core';
import webPush from 'web-push';

const RETENTION_MS = 31 * 24 * 60 * 60 * 1000;
const OFFLINE_DELAY_MS = 5 * 60 * 1000;

export default class Events {
  debug = debug('Events');
  delivery = Promise.resolve();

  constructor({ sqlite, version, sendPush = webPush.sendNotification.bind(webPush), request = fetch }) {
    this.sqlite = sqlite;
    this.userAgent = `Containarr v${version.replace(/^v/, '')}`;
    this.sendPush = sendPush;
    this.request = request;
    this.ready = Promise.resolve().then(async () => {
      this.Event = await sqlite.getModel('Event');
      this.AppState = await sqlite.getModel('EventAppState');
      this.PushDevice = await sqlite.getModel('PushDevice');
      this.Webhook = await sqlite.getModel('Webhook');
      this.Setting = await sqlite.getModel('Setting');
      const [keys] = await this.Setting.findOrCreate({
        where: { key: 'events.vapid' },
        defaults: { value: webPush.generateVAPIDKeys() },
      });
      this.vapidDetails = { subject: 'https://containarr.com', ...keys.value };
      const sequelize = await sqlite.sequelize;
      let event;
      await sequelize.transaction(async transaction => {
        const [setting, created] = await this.Setting.findOrCreate({
          where: { key: 'events.version' }, defaults: { value: version }, transaction,
        });
        if (!created && setting.value !== version) {
          event = await this.Event.create({
            eventName: 'containarr.updated',
            message: `Containarr has been updated to v${version.replace(/^v/, '')}.`,
            details: { version, previousVersion: setting.value },
          }, { transaction });
          await setting.update({ value: version }, { transaction });
        }
      });
      await this.Event.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - RETENTION_MS) } } });
      if (event) this.enqueue(event);
    });
    this.ready.catch(error => this.debug(error));
    this.cleanupInterval = setInterval(() => {
      this.ready.then(() => this.Event.destroy({
        where: { createdAt: { [Op.lt]: new Date(Date.now() - RETENTION_MS) } },
      })).catch(error => this.debug(error));
    }, 60_000);
    this.cleanupInterval.unref();
  }

  async record(values, deduplication = null) {
    await this.ready;
    let event = null;
    const sequelize = await this.sqlite.sequelize;
    await sequelize.transaction(async transaction => {
      if (deduplication) {
        const [setting, created] = await this.Setting.findOrCreate({
          where: { key: deduplication.key }, defaults: { value: deduplication.value }, transaction,
        });
        if (!created && setting.value === deduplication.value) return;
        if (!created) await setting.update({ value: deduplication.value }, { transaction });
      }
      event = await this.Event.create(values, { transaction });
    });
    if (event) this.enqueue(event);
    return event;
  }

  async observeApp({ appId, appName, online, disabled = false, now = new Date() }) {
    await this.ready;
    let event = null;
    const sequelize = await this.sqlite.sequelize;
    await sequelize.transaction(async transaction => {
      const [state] = await this.AppState.findOrCreate({ where: { appId }, transaction });
      if (disabled || online) {
        if (!disabled && state.notified) {
          event = await this.Event.create({
            eventName: 'app.online', message: `${appName} is back online.`, appId, appName,
            details: { offlineSince: state.offlineSince, durationSeconds: Math.floor((now - state.offlineSince) / 1000) },
            createdAt: now,
          }, { transaction });
        }
        if (state.offlineSince) await state.update({ offlineSince: null, notified: false }, { transaction });
      } else if (!state.offlineSince) {
        await state.update({ offlineSince: now }, { transaction });
      } else if (!state.notified && now - state.offlineSince >= OFFLINE_DELAY_MS) {
        event = await this.Event.create({
          eventName: 'app.offline', message: `${appName} has gone offline.`, appId, appName,
          details: { offlineSince: state.offlineSince }, createdAt: now,
        }, { transaction });
        await state.update({ notified: true }, { transaction });
      }
    });
    if (event) this.enqueue(event);
  }

  async list({ page = 1, sortBy = 'createdAt', direction = 'desc', dev = false } = {}) {
    if (!['createdAt', 'message', 'appName'].includes(sortBy) || !['asc', 'desc'].includes(direction)) {
      throw Object.assign(new Error('Invalid event sort order.'), { statusCode: 400 });
    }
    await this.ready;
    const column = sortBy === 'appName' ? sql.fn('lower', sql.fn('coalesce', sql.col('appName'), 'Containarr'))
      : sortBy === 'message' ? sql.fn('lower', sql.col('message')) : 'createdAt';
    const { count, rows } = await this.Event.findAndCountAll({
      where: { createdAt: { [Op.gte]: new Date(Date.now() - RETENTION_MS) } },
      order: [[column, direction.toUpperCase()], ...(sortBy === 'createdAt' ? [] : [['createdAt', 'DESC']]), ['id', 'DESC']],
      limit: 50, offset: (page - 1) * 50,
    });
    let debugApp;
    if (dev) {
      const App = await this.sqlite.getModel('App');
      debugApp = await App.findOne({ attributes: ['id', 'name'], order: [['createdAt', 'ASC'], ['id', 'ASC']] });
    }
    return { events: rows, total: count, page, pageSize: 50, ...(dev ? { debugApp } : {}) };
  }

  async createDebugEvent(eventName) {
    const samples = new Map([
      ['app.update_available', {
        message: ' has an update available.',
        details: { imageId: 'sha256:debug-image' },
      }],
      ['app.updated', {
        message: ' has been updated.',
        details: { imageId: 'sha256:debug-image' },
      }],
      ['app.offline', {
        message: ' has gone offline.',
        details: { offlineSince: new Date(Date.now() - 300_000).toISOString() },
      }],
      ['app.online', {
        message: ' is back online.',
        details: { offlineSince: new Date(Date.now() - 600_000).toISOString(), durationSeconds: 600 },
      }],
      ['containarr.update_available', {
        message: 'Containarr has an update available: v1.2.3.',
        details: { version: '1.2.3', currentVersion: '1.2.2' },
      }],
      ['containarr.updated', {
        message: 'Containarr has been updated to v1.2.3.',
        details: { version: '1.2.3', previousVersion: '1.2.2' },
      }],
    ]);
    const sample = samples.get(eventName);
    if (!sample) {
      throw Object.assign(new Error('Choose a supported debug event.'), { statusCode: 400 });
    }
    if (eventName.startsWith('app.')) {
      const App = await this.sqlite.getModel('App');
      const app = await App.findOne({ order: [['createdAt', 'ASC'], ['id', 'ASC']] });
      if (!app) {
        throw Object.assign(new Error('Install an app before creating app test events.'), { statusCode: 400 });
      }
      sample.appId = app.id;
      sample.appName = app.name;
      sample.message = app.name + sample.message;
      if (sample.details.imageId) sample.details.dockerImage = app.dockerImage;
    }
    return this.record({ ...sample, eventName, details: { ...sample.details, test: true } });
  }

  async sendTest({ kind, id }) {
    await this.ready;
    if (!['device', 'webhook'].includes(kind)) {
      throw Object.assign(new Error('Invalid destination type.'), { statusCode: 400 });
    }
    const destination = await (kind === 'device' ? this.PushDevice : this.Webhook).findByPk(id);
    if (!destination) {
      throw Object.assign(new Error('Notification destination not found.'), { statusCode: 404 });
    }
    const payload = JSON.stringify({
      eventId: randomUUID(), eventName: 'containarr.test',
      eventAt: new Date().toISOString(), appId: null, appName: null,
      message: 'This is a test event from Containarr.', details: { test: true },
    });
    try {
      if (kind === 'device') {
        await this.sendPush(destination.subscription, payload, {
          vapidDetails: this.vapidDetails, TTL: 3600, timeout: 10_000,
        });
      } else {
        let url = destination.url;
        const signal = AbortSignal.timeout(10_000);
        for (let redirects = 0; ; redirects++) {
          const response = await this.request(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': this.userAgent }, body: payload,
            signal, redirect: 'manual',
          });
          await response.body?.cancel();
          const location = response.headers.get('location');
          if ([301, 302, 303, 307, 308].includes(response.status) && location) {
            if (redirects === 3) {
              throw Object.assign(new Error('Too many webhook redirects.'), { code: 'WEBHOOK_REDIRECT_LIMIT' });
            }
            const next = new URL(location, url);
            if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) {
              throw new Error('Invalid webhook redirect URL.');
            }
            next.hash = '';
            // Keep the webhook's POST method and JSON payload at the new endpoint.
            url = next.href;
            continue;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          break;
        }
      }
    } catch (error) {
      if (kind === 'device' && [404, 410].includes(error.statusCode)) {
        await destination.destroy();
        throw Object.assign(new Error('This push registration has expired. Register the device again.'), { statusCode: 410 });
      }
      const message = error.code === 'WEBHOOK_REDIRECT_LIMIT' ? 'Too many webhook redirects (maximum 3).'
        : error.statusCode ? `HTTP ${error.statusCode}`
        : /^HTTP \d+$/.test(error.message) ? error.message : 'Delivery failed. Check the destination and connection.';
      await destination.update({ lastError: message });
      throw Object.assign(new Error(`Test event failed: ${message}`), { statusCode: 502 });
    }
    await destination.update({ lastSentAt: new Date(), lastError: null });
  }

  enqueue(event) {
    // Persisting an event never waits for an external notification destination.
    this.delivery = this.delivery.then(async () => {
      if (new Date(event.createdAt).getTime() < Date.now() - RETENTION_MS) return;
      const payload = JSON.stringify({
        eventId: event.id, eventName: event.eventName, eventAt: event.createdAt,
        appId: event.appId ?? null, appName: event.appName ?? null, message: event.message,
        details: event.details,
      });
      const destinations = [
        ...(await this.PushDevice.findAll({ where: { createdAt: { [Op.lte]: event.createdAt } } })).map(device => ({ device })),
        ...(await this.Webhook.findAll({ where: { createdAt: { [Op.lte]: event.createdAt } } })).map(webhook => ({ webhook })),
      ];
      // Bound fan-out so a large device list cannot exhaust sockets.
      for (let index = 0; index < destinations.length; index += 4) {
        await Promise.all(destinations.slice(index, index + 4).map(async ({ device, webhook }) => {
          const destination = device || webhook;
          try {
            if (device) {
              await this.sendPush(device.subscription, payload, {
                vapidDetails: this.vapidDetails, TTL: 3600, timeout: 10_000,
              });
            } else {
              let url = webhook.url;
              const signal = AbortSignal.timeout(10_000);
              for (let redirects = 0; ; redirects++) {
                const response = await this.request(url, {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': this.userAgent }, body: payload,
                  signal, redirect: 'manual',
                });
                await response.body?.cancel();
                const location = response.headers.get('location');
                if ([301, 302, 303, 307, 308].includes(response.status) && location) {
                  if (redirects === 3) {
                    throw Object.assign(new Error('Too many webhook redirects.'), { code: 'WEBHOOK_REDIRECT_LIMIT' });
                  }
                  const next = new URL(location, url);
                  if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) {
                    throw new Error('Invalid webhook redirect URL.');
                  }
                  next.hash = '';
                  // Keep the webhook's POST method and JSON payload at the new endpoint.
                  url = next.href;
                  continue;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                break;
              }
            }
            await destination.update({ lastSentAt: new Date(), lastError: null });
          } catch (error) {
            if (device && [404, 410].includes(error.statusCode)) {
              await device.destroy();
            } else {
              // Avoid persisting provider response bodies or URLs containing secrets.
              const message = error.code === 'WEBHOOK_REDIRECT_LIMIT' ? 'Too many webhook redirects (maximum 3).'
                : error.statusCode ? `HTTP ${error.statusCode}`
                : /^HTTP \d+$/.test(error.message) ? error.message : 'Delivery failed. Check the destination and connection.';
              await destination.update({ lastError: message });
            }
          }
        }));
      }
    }).catch(error => this.debug(error));
  }
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');

for (const existingWindow of [false, true]) {
  for (const [eventName, appId, path] of [
    ['app.update_available', 'plex', '/#/apps/plex'],
    ['app.updated', 'plex', '/#/apps/plex'],
    ['app.offline', 'immich', '/#/apps/immich'],
    ['app.online', 'app/with spaces', '/#/apps/app%2Fwith%20spaces'],
    ['containarr.update_available', null, '/#/updates'],
    ['containarr.updated', null, '/#/updates'],
    ['containarr.test', null, '/#/events'],
  ]) {
    test(`${eventName} opens ${path} in ${existingWindow ? 'an existing' : 'a new'} window`, async () => {
      const handlers = new Map();
      const actions = [];
      let notification, pending;
      runInNewContext(source, {
        URL,
        self: {
          location: { origin: 'https://containarr.example' },
          addEventListener: (name, handler) => handlers.set(name, handler),
          registration: { showNotification: async (title, options) => { notification = options; } },
          clients: {
            matchAll: async () => existingWindow ? [{
              url: 'https://containarr.example/#/events',
              navigate: async url => actions.push(['navigate', url]),
              focus: async () => actions.push(['focus']),
            }] : [],
            openWindow: async url => actions.push(['open', url]),
          },
        },
      });
      handlers.get('push')({
        data: { json: () => ({ eventName, appId, message: 'Test notification', eventId: 'event-id' }) },
        waitUntil: promise => { pending = promise; },
      });
      await pending;
      assert.equal(notification.body, 'Test notification');
      assert.equal(notification.data.url, path);
      handlers.get('notificationclick')({
        notification: { ...notification, close: () => actions.push(['close']) },
        waitUntil: promise => { pending = promise; },
      });
      await pending;
      assert.deepEqual(actions, existingWindow
        ? [['close'], ['navigate', `https://containarr.example${path}`], ['focus']]
        : [['close'], ['open', `https://containarr.example${path}`]]);
    });
  }
}

test('older notifications and external destinations fall back to the event log', async () => {
  for (const data of [undefined, { url: 'https://other.example/' }]) {
    const handlers = new Map();
    let pending, opened;
    runInNewContext(source, {
      URL,
      self: {
        location: { origin: 'https://containarr.example' },
        addEventListener: (name, handler) => handlers.set(name, handler),
        clients: { matchAll: async () => [], openWindow: async url => { opened = url; } },
      },
    });
    handlers.get('notificationclick')({
      notification: { data, close() {} },
      waitUntil: promise => { pending = promise; },
    });
    await pending;
    assert.equal(opened, 'https://containarr.example/#/events');
  }
});

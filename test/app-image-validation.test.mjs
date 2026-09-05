import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const dockerUrl = new URL('../services/Docker.mjs', import.meta.url).href;
const sqliteUrl = new URL('../services/SQLite.mjs', import.meta.url).href;
const firewallUrl = new URL('../services/Firewall.mjs', import.meta.url).href;
const appUrl = new URL('../lib/Apps/App.mjs', import.meta.url).href;
const dockerClassUrl = new URL('../lib/Docker.mjs', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === dockerUrl) return { format: 'module', shortCircuit: true, source: `
      import Docker from ${JSON.stringify(dockerClassUrl)};
      export default {
        validateImage: Docker.prototype.validateImage,
        getImageMetadata: async () => ({ Id: 'image' }),
        getCurrentContainerMetadata: async () => ({ Id: 'containarr' }),
        getContainerInstance: async () => ({ inspect: async () => ({
          Id: 'external', Name: '/external', Config: { Image: 'alpine' },
          State: { Running: true },
        }) }),
      };
    ` };
    if (url === sqliteUrl) return { format: 'module', shortCircuit: true, source: `
      export const state = { writes: 0 };
      export default {
        getModelApp: async () => ({
          findAll: async () => [],
          create: async values => {
            state.writes++;
            return {
              ...values, id: 'app',
              set(values) { state.writes++; Object.assign(this, values); },
              async save() { state.writes++; },
            };
          },
        }),
        getModelProxy: async () => ({ findOne: async () => null, findAll: async () => [] }),
      };
    ` };
    if (url === firewallUrl) return { format: 'module', shortCircuit: true, source: `
      export default { getPolicy: async () => ({}) };
    ` };
    if (url === appUrl) return { format: 'module', shortCircuit: true, source: `
      export default class App {
        constructor({ db }) { this.db = db; }
        get policyId() { return this.db.policyId; }
      }
    ` };
    return nextLoad(url, context);
  },
});
const { default: Apps } = await import('../lib/Apps.mjs');
const { state } = await import(sqliteUrl);
hooks.deregister();

test('invalid image input cannot create an app or change saved settings', async () => {
  const apps = new Apps();
  const app = await apps.createApp({ name: 'Original', dockerImage: 'alpine' });
  const writes = state.writes;
  for (const dockerImage of ['https://images/invalid', '//images', 'alpine/', '', null, {}]) {
    await assert.rejects(apps.createApp({ dockerImage }), { statusCode: 400 });
    await assert.rejects(apps.updateApp({ appId: 'app', name: 'Changed', dockerImage }), { statusCode: 400 });
  }
  assert.equal(state.writes, writes);
  assert.equal(app.db.name, 'Original');
  assert.equal(app.db.dockerImage, 'alpine');
  await apps.updateApp({ appId: 'app', name: 'Updated', dockerImage: 'alpine:3.21' });
  assert.equal(app.db.dockerImage, 'alpine:3.21');
});

test('invalid image input cannot persist an imported container', async () => {
  const apps = new Apps();
  const writes = state.writes;
  await assert.rejects(apps.importContainer({
    containerId: 'external',
    settings: { dockerImage: 'https://images/invalid' },
  }), { statusCode: 400 });
  assert.equal(state.writes, writes);
});

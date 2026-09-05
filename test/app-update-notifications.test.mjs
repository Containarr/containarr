import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const dockerUrl = new URL('../services/Docker.mjs', import.meta.url).href;
const eventsUrl = new URL('../services/Events.mjs', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === dockerUrl) return { format: 'module', shortCircuit: true, source: `
      export default {
        pullImage: async () => {},
        getImageMetadata: async () => ({ Id: 'sha256:new' }),
        findContainerByLabel: async () => ({ Id: 'container', ImageID: 'sha256:old', State: 'running' }),
        getContainerInstance: async () => ({ id: 'container' }),
      };
    ` };
    if (url === eventsUrl) return { format: 'module', shortCircuit: true, source: `
      export const recorded = [];
      export default { observeApp: async () => {}, record: async event => { recorded.push(event); } };
    ` };
    return nextLoad(url, context);
  },
});
const { default: App } = await import('../lib/Apps/App.mjs');
const { recorded } = await import(eventsUrl);
hooks.deregister();

for (const autoUpdate of [false, true]) {
  for (const applyUpdate of [false, true]) {
    test(`update notifications with autoUpdate=${autoUpdate} and applyUpdate=${applyUpdate}`, async () => {
      recorded.length = 0;
      const app = new App({ sync: false, db: { id: 'plex', name: 'Plex', dockerImage: 'plex:latest', autoUpdate } });
      app.dispose();
      let updated = false;
      app.recreateContainer = async () => { updated = true; };
      await app.checkImageUpdate({ applyUpdate });
      assert.equal(updated, applyUpdate);
      assert.deepEqual(recorded.map(event => event.eventName), [
        ...(!autoUpdate ? ['app.update_available'] : []),
        ...(applyUpdate ? ['app.updated'] : []),
      ]);
      assert.ok(recorded.every(event => event.appId === 'plex'));
    });
  }
}

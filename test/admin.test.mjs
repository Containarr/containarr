import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const mocks = {
  Settings: `export default { policyId: null, async getSetting() { return this.policyId; }, async setSetting(key, value) { this.policyId = value; } };`,
  DDNS: `export default { getDomain: async () => 'example.com' };`,
  LetsEncrypt: `export default { getTraefikCertificates: async () => [] };`,
  Apps: `export default { getApps: async () => ({}) };`,
  Proxies: `export default { getProxies: async () => ({}) };`,
  HTTPServer: `export default {};`,
  Traffic: `export default {};`,
  Firewall: `export default { async getPolicy({ policyId }) { if (!['public', 'private'].includes(policyId)) throw new Error('missing'); } };`,
};
const hooks = registerHooks({
  load(url, context, nextLoad) {
    for (const [name, source] of Object.entries(mocks)) {
      if (url === new URL(`../services/${name}.mjs`, import.meta.url).href) {
        return { format: 'module', shortCircuit: true, source };
      }
    }
    return nextLoad(url, context);
  },
});
const { default: Traefik } = await import('../lib/Traefik.mjs');
const { default: Settings } = await import('../services/Settings.mjs');
const { default: admin } = await import('../lib/HTTPServer/api/v1/admin/index.mjs');
const { default: express } = await import('express');
hooks.deregister();

test('admin policy defaults to Public, validates changes, and protects the admin domain', async () => {
  const server = express().use(express.json()).use(admin).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { url: 'https://containarr.example.com', policyId: 'public' });
    let config = await Traefik.prototype.getConfig.call({});
    assert.equal(config.http.routers['containarr-https'].middlewares, undefined);
    for (const policyId of [null, {}, 'missing']) {
      assert.equal((await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policyId }) })).status, 400);
      assert.equal(Settings.policyId, null);
    }
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policyId: 'private', url: 'https://attacker.example' }) });
    assert.deepEqual(await response.json(), { url: 'https://containarr.example.com', policyId: 'private' });
    assert.equal((await (await fetch(url)).json()).policyId, 'private');
    config = await Traefik.prototype.getConfig.call({});
    assert.deepEqual(config.http.routers['containarr-https'].middlewares, ['firewall-private']);
    assert.match(config.http.middlewares['firewall-private'].forwardAuth.address, /\/firewall\/private$/);
    assert.equal(config.http.middlewares['firewall-private'].forwardAuth.trustForwardHeader, false);
    assert.equal(config.http.routers['containarr-local-http'].middlewares, undefined);
    Settings.policyId = 'public';
    config = await Traefik.prototype.getConfig.call({});
    assert.equal(config.http.routers['containarr-https'].middlewares, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

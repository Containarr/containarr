import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const directory = await mkdtemp(join(tmpdir(), 'containarr-reset-admin-firewall-'));
process.env.SQLITE_STORAGE = join(directory, 'db.sqlite');
const command = fileURLToPath(new URL('../reset-admin-firewall.mjs', import.meta.url));
const run = promisify(execFile);
const { default: SQLite } = await import('../services/SQLite.mjs');
const { default: Settings } = await import('../services/Settings.mjs');
const sequelize = await SQLite.sequelize;
after(async () => {
  await sequelize.close();
  await rm(directory, { recursive: true, force: true });
});

test('reset refuses a missing database without creating it', async () => {
  const missing = join(directory, 'missing.sqlite');
  await assert.rejects(run(process.execPath, [command], {
    env: { ...process.env, SQLITE_STORAGE: missing },
  }), error => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /Could not reset the admin firewall policy/);
    return true;
  });
  await assert.rejects(stat(missing), { code: 'ENOENT' });
});

test('reset restores Public while preserving other settings, policies, and schema', async () => {
  await Settings.setSetting('adminPolicyId', 'private');
  await Settings.setSetting('domain', 'example.com');
  const Policy = await SQLite.getModelPolicy();
  await Policy.create({ id: 'private', name: 'Private', allowedIps: ['192.168.1.0/24'] });
  const policies = (await Policy.findAll()).map(policy => policy.toJSON());
  const [schema] = await sequelize.query('SELECT name, sql FROM sqlite_master ORDER BY name');
  for (let attempt = 0; attempt < 2; attempt++) {
    const { stdout } = await run(process.execPath, [command]);
    assert.match(stdout, /Admin firewall policy reset to Public/);
    assert.equal(await Settings.getSetting('adminPolicyId') || 'public', 'public');
    assert.equal(await Settings.getSetting('domain'), 'example.com');
    assert.deepEqual((await Policy.findAll()).map(policy => policy.toJSON()), policies);
    assert.deepEqual((await sequelize.query('SELECT name, sql FROM sqlite_master ORDER BY name'))[0], schema);
  }
});

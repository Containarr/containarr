import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'containarr-backups-'));
const remote = path.join(root, 'remote.git');
const repositoryUrl = 'git@example.com:backup.git';
const execFile = childProcess.execFile;
const run = promisify(execFile);
process.env.BACKUP_DIRECTORY = path.join(root, 'backups');
const sqliteUrl = new URL('../services/SQLite.mjs', import.meta.url).href;
const settingsUrl = new URL('../services/Settings.mjs', import.meta.url).href;
const dockerUrl = new URL('../services/Docker.mjs', import.meta.url).href;
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === sqliteUrl) return { format: 'module', shortCircuit: true, source: `
      import fs from 'node:fs/promises';
      export const state = { apps: [], snapshots: 0 };
      export default {
        getModelApp: async () => ({ findAll: async () => state.apps }),
        sequelize: Promise.resolve({ query: async sql => {
          state.snapshots++;
          await fs.writeFile(sql.slice(13, -1).replaceAll("''", "'"), 'database snapshot');
        } }),
      };
    ` };
    if (url === settingsUrl) return { format: 'module', shortCircuit: true, source: `
      export const settings = new Map();
      export default {
        getSetting: async key => settings.get(key) ?? null,
        setSetting: async (key, value) => { settings.set(key, value); },
      };
    ` };
    if (url === dockerUrl) return { format: 'module', shortCircuit: true, source: `
      import fs from 'node:fs/promises';
      export const state = { captured: [], fail: false, gate: null };
      export default { archiveVolume: async ({ volume, destination }) => {
        state.captured.push(volume);
        if (state.gate) await state.gate;
        if (state.fail) throw new Error('Volume unavailable');
        await fs.writeFile(destination, 'archive:' + volume);
      } };
    ` };
    return nextLoad(url, context);
  },
});
const { default: Backups } = await import('../lib/Backups.mjs');
const { state: db } = await import(sqliteUrl);
const { settings } = await import(settingsUrl);
const { state: docker } = await import(dockerUrl);
hooks.deregister();
// Exercise real Git commits and pushes against a disposable local remote.
childProcess.execFile = (command, args, ...rest) => execFile(command,
  command === 'git' ? args.map(arg => arg === repositoryUrl ? remote : arg) : args, ...rest);
childProcess.execFile[promisify.custom] = (command, args, options) => run(command,
  command === 'git' ? args.map(arg => arg === repositoryUrl ? remote : arg) : args, options);
after(async () => {
  childProcess.execFile = execFile;
  await fs.rm(root, { recursive: true, force: true });
});
await run('git', ['init', '--bare', remote]);

const backups = new Backups();
test('backup settings reject invalid intervals before changing persisted configuration', async () => {
  for (const intervalHours of [-1, 1.5, 8761, '2', Infinity, NaN]) {
    await assert.rejects(backups.setSettings({ repositoryUrl, intervalHours }), /whole number/);
  }
  assert.equal(settings.size, 0);
  assert.equal((await backups.getSettings()).intervalHours, 6);
});

test('selected data is committed with a manifest; unselected media is never captured', async () => {
  db.apps = [{ id: 'app-1', name: 'Plex', dockerVolumes: ['config:/config', '/media:/media'], backupVolumes: ['config:/config'] }];
  const result = await backups.setSettings({ repositoryUrl });
  assert.equal(result.error, null);
  assert.equal(result.intervalHours, 6);
  assert.ok(result.lastBackupAt);
  assert.deepEqual(docker.captured, ['config:/config']);
  const { stdout } = await run('git', ['--git-dir', remote, 'show', 'main:volumes/manifest.json']);
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.volumes.length, 1);
  assert.equal(manifest.volumes[0].volume, 'config:/config');
  assert.equal(manifest.volumes[0].appId, 'app-1');
  assert.match(manifest.volumes[0].archive, /^[a-f0-9]{64}\.tar\.gz$/);
  assert.equal((await run('git', ['--git-dir', remote, 'show', `main:volumes/${manifest.volumes[0].archive}`])).stdout, 'archive:config:/config');
});

test('failed capture preserves the remote backup and last successful time', async () => {
  const previous = (await run('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout;
  const lastBackupAt = settings.get('backup_last_backup_at');
  docker.fail = true;
  await assert.rejects(backups.backup(), /Could not back up Plex.*Volume unavailable/);
  assert.equal(settings.get('backup_last_backup_at'), lastBackupAt);
  assert.equal((await run('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout, previous);
  assert.match((await backups.getSettings()).error, /Volume unavailable/);
  docker.fail = false;
});

test('concurrent requests share one backup and recovery clears the error', async () => {
  docker.captured = [];
  let release;
  docker.gate = new Promise(resolve => { release = resolve; });
  const first = backups.backup();
  const second = backups.backup();
  release();
  await Promise.all([first, second]);
  docker.gate = null;
  assert.deepEqual(docker.captured, ['config:/config']);
  assert.equal((await backups.getSettings()).error, null);
});

test('deselected and deleted volumes disappear from the latest snapshot', async () => {
  db.apps[0].backupVolumes = [];
  docker.captured = [];
  await backups.backup();
  assert.deepEqual(docker.captured, []);
  const { stdout } = await run('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main']);
  assert.deepEqual(stdout.trim().split('\n'), ['db.sqlite', 'volumes/manifest.json']);
  db.apps = [];
  await backups.backup();
  assert.deepEqual(JSON.parse((await run('git', ['--git-dir', remote, 'show', 'main:volumes/manifest.json'])).stdout).volumes, []);
});

test('intervals honor elapsed hours, resume after restart, and can be disabled', async t => {
  const restarted = new Backups();
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  settings.set('backup_last_backup_at', new Date(now).toISOString());
  settings.delete('backup_interval_hours');
  const snapshots = db.snapshots;
  now += 6 * 3_600_000 - 1;
  await restarted.checkSchedule();
  assert.equal(db.snapshots, snapshots);
  now++;
  await restarted.checkSchedule();
  assert.equal(db.snapshots, snapshots + 1);
  await restarted.checkSchedule();
  assert.equal(db.snapshots, snapshots + 1);
  settings.set('backup_interval_hours', 0);
  assert.equal((await restarted.getSettings()).intervalHours, 0);
  now += 24 * 3_600_000;
  await restarted.checkSchedule();
  assert.equal(db.snapshots, snapshots + 1);
  restarted.stop();
});

test('failed scheduled backups wait an interval before retrying', async t => {
  const restarted = new Backups();
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  settings.set('backup_last_backup_at', new Date(now - 3_600_000).toISOString());
  settings.set('backup_interval_hours', 1);
  db.apps = [{ id: 'app-1', name: 'Plex', dockerVolumes: ['config:/config'], backupVolumes: ['config:/config'] }];
  docker.captured = [];
  docker.fail = true;
  await assert.rejects(restarted.checkSchedule(), /Volume unavailable/);
  assert.equal(docker.captured.length, 1);
  now += 60_000;
  await restarted.checkSchedule();
  assert.equal(docker.captured.length, 1);
  now += 3_600_000;
  docker.fail = false;
  await restarted.checkSchedule();
  assert.equal(docker.captured.length, 2);
  db.apps = [];
});

test('schedule starts on service startup, keeps checking, and stops cleanly', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const restarted = new Backups();
  let checks = 0;
  t.mock.method(restarted, 'checkSchedule', async () => { checks++; });
  restarted.start();
  restarted.start();
  assert.equal(checks, 1);
  t.mock.timers.tick(60_000);
  assert.equal(checks, 2);
  t.mock.timers.tick(60_000);
  assert.equal(checks, 3);
  restarted.stop();
  t.mock.timers.tick(60_000);
  assert.equal(checks, 3);
});

test('legacy database-only repositories remain supported', async () => {
  const local = path.join(root, 'legacy');
  await run('git', ['clone', remote, local]);
  await run('git', ['checkout', 'main'], { cwd: local });
  await run('git', ['config', 'user.name', 'Test'], { cwd: local });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: local });
  await run('git', ['rm', '-r', 'volumes'], { cwd: local });
  await run('git', ['commit', '-m', 'Database only'], { cwd: local });
  await run('git', ['push', 'origin', 'main'], { cwd: local });
  await backups.backup();
  assert.equal((await backups.getSettings()).error, null);
  await fs.writeFile(path.join(local, 'unrelated.txt'), 'do not replace');
  await run('git', ['add', '.'], { cwd: local });
  await run('git', ['commit', '-m', 'Unrelated content'], { cwd: local });
  await run('git', ['pull', '--rebase', 'origin', 'main'], { cwd: local });
  await run('git', ['push', 'origin', 'main'], { cwd: local });
  await assert.rejects(backups.backup(), /only Containarr backup files/);
});

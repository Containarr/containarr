import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const directory = await mkdtemp(join(tmpdir(), 'containarr-reset-password-'));
process.env.SQLITE_STORAGE = join(directory, 'db.sqlite');
const command = fileURLToPath(new URL('../reset-password.mjs', import.meta.url));
const run = promisify(execFile);
const { default: SQLite } = await import('../services/SQLite.mjs');
const { default: Auth } = await import('../services/Auth.mjs');
const sequelize = await SQLite.sequelize;
after(async () => {
  await sequelize.close();
  await rm(directory, { recursive: true, force: true });
});

test('reset refuses missing databases without creating a new one', async () => {
  const missing = join(directory, 'missing.sqlite');
  await assert.rejects(run(process.execPath, [command], {
    env: { ...process.env, SQLITE_STORAGE: missing },
  }), error => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /Could not reset the admin password/);
    return true;
  });
  await assert.rejects(stat(missing), { code: 'ENOENT' });
});

test('reset refuses accounts that have not completed onboarding', async () => {
  await assert.rejects(run(process.execPath, [command]), error => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /No admin account exists/);
    return true;
  });
  assert.equal(await (await SQLite.getModelUser()).count(), 0);
});

test('reset works with the running auth service and preserves configuration', async () => {
  const user = await Auth.onboard({ username: 'my-admin', password: 'original-password' });
  const first = await Auth.createSession(user);
  const second = await Auth.createSession(user);
  const Setting = await SQLite.getModelSetting();
  await Setting.create({ key: 'domain', value: 'mydomain.com' });
  const [schema] = await sequelize.query('SELECT name, sql FROM sqlite_master ORDER BY name');

  const { stdout } = await run(process.execPath, [command]);
  assert.match(stdout, /Username: my-admin/);
  const password = stdout.match(/^Password: ([\w-]{32})$/m)?.[1];
  assert.ok(password, 'The command prints the generated password after committing');
  assert.equal((await Auth.login({ username: 'my-admin', password })).id, user.id);
  await assert.rejects(Auth.login({ username: 'my-admin', password: 'original-password' }), { statusCode: 401 });
  for (const session of [first, second]) {
    assert.equal(await Auth.authenticate({ headers: { cookie: `containarr_session=${session.token}` } }), null);
  }
  assert.equal((await Setting.findOne({ where: { key: 'domain' } })).value, 'mydomain.com');
  assert.equal(await (await SQLite.getModelUser()).count(), 1);
  assert.deepEqual((await sequelize.query('SELECT name, sql FROM sqlite_master ORDER BY name'))[0], schema);
});

test('failed session revocation rolls back the password change', async () => {
  const User = await SQLite.getModelUser();
  const user = await User.findByPk('owner');
  const oldHash = user.passwordHash;
  const session = await Auth.createSession(user);
  await sequelize.query("CREATE TRIGGER reject_session_delete BEFORE DELETE ON Sessions BEGIN SELECT RAISE(ABORT, 'session deletion failed'); END");
  try {
    await assert.rejects(run(process.execPath, [command]), error => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /session deletion failed/);
      return true;
    });
    assert.equal((await User.findByPk('owner')).passwordHash, oldHash);
    assert.equal((await Auth.authenticate({ headers: { cookie: `containarr_session=${session.token}` } })).id, user.id);
  } finally {
    await sequelize.query('DROP TRIGGER reject_session_delete');
  }
});

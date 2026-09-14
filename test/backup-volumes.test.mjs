import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import AppSchema from '../lib/SQLite/App.mjs';
import Docker from '../lib/Docker.mjs';

test('existing app databases migrate with no volumes selected and preserve selections on reopen', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'containarr-backup-schema-'));
  const options = { dialect: SqliteDialect, storage: path.join(root, 'db.sqlite'), logging: false, pool: { max: 1 } };
  let sequelize = new Sequelize(options);
  try {
    const { backupVolumes, ...oldSchema } = AppSchema;
    const OldApp = sequelize.define('App', oldSchema);
    await sequelize.sync();
    await OldApp.create({ id: 'app', name: 'App', subdomain: 'app', dockerImage: 'alpine', dockerVolumes: ['config:/config', '/media:/media'] });
    await sequelize.close();
    sequelize = new Sequelize(options);
    const App = sequelize.define('App', AppSchema);
    await sequelize.sync({ alter: true });
    const app = await App.findByPk('app');
    assert.deepEqual(app.backupVolumes, []);
    app.backupVolumes = ['config:/config'];
    await app.save();
    assert.deepEqual((await App.findByPk('app')).backupVolumes, ['config:/config']);
    for (const selection of [['other:/config'], ['/media'], 'config:/config', [null]]) {
      app.backupVolumes = selection;
      await assert.rejects(app.save(), /configured volumes/);
    }
    app.backupVolumes = ['/media:/media'];
    await app.save();
    await sequelize.close();
    sequelize = new Sequelize(options);
    const ReopenedApp = sequelize.define('App', AppSchema);
    assert.deepEqual((await ReopenedApp.findByPk('app')).backupVolumes, ['/media:/media']);
  } finally {
    await sequelize.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('archives stream from an isolated read-only mount, with named volumes inspected first', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'containarr-volume-'));
  try {
    for (const volume of ['config:/config', '/host/config:/config:ro']) {
      const instance = Object.create(Docker.prototype);
      const [source] = volume.split(':');
      let inspected = false;
      let removed = false;
      instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr-image', Mounts: [] });
      instance.dockerode = Promise.resolve({
        getVolume: name => ({ inspect: async () => { assert.equal(name, source); inspected = true; } }),
        createContainer: async config => {
          assert.equal(config.Image, 'containarr-image');
          assert.equal(config.HostConfig.NetworkMode, 'none');
          assert.equal(config.HostConfig.ReadonlyRootfs, true);
          assert.deepEqual(config.HostConfig.Mounts, [{
            Type: source.startsWith('/') ? 'bind' : 'volume', Source: source, Target: '/backup-source', ReadOnly: true,
            ...(!source.startsWith('/') ? { VolumeOptions: { NoCopy: true } } : {}),
          }]);
          assert.equal(inspected, !source.startsWith('/'));
          return {
            start: async () => {},
            getArchive: async options => {
              assert.equal(options.path, '/backup-source');
              return Readable.from([Buffer.from('archive content')]);
            },
            remove: async options => { assert.equal(options.force, true); removed = true; },
          };
        },
      });
      const destination = path.join(root, 'archive.tar.gz');
      await instance.archiveVolume({ volume, destination, backupDirectory: '/data/backups' });
      assert.equal(gunzipSync(await fs.readFile(destination)).toString(), 'archive content');
      assert.equal(removed, true);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('missing volumes and recursive backup sources fail without creating a helper', async () => {
  const instance = Object.create(Docker.prototype);
  instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr', Mounts: [{ Source: '/host/data', Destination: '/data', Name: 'containarr-data' }] });
  instance.dockerode = Promise.resolve({
    getVolume: name => ({ inspect: async () => { if (name === 'missing') throw new Error('Not found'); } }),
    createContainer: async () => assert.fail('Must not create a helper'),
  });
  for (const volume of ['missing:/data', 'containarr-data:/data', '/host:/data', '/host/data/backups:/data', 'relative/path:/data']) {
    await assert.rejects(instance.archiveVolume({ volume, destination: '/unused', backupDirectory: '/data/backups' }));
  }
});

test('archive failures always remove the helper', async () => {
  const instance = Object.create(Docker.prototype);
  let removed = false;
  instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr' });
  instance.dockerode = Promise.resolve({
    createContainer: async () => ({
      start: async () => {},
      getArchive: async () => { throw new Error('Read failed'); },
      remove: async () => { removed = true; },
    }),
  });
  await assert.rejects(instance.archiveVolume({ volume: '/config:/config', destination: '/unused', backupDirectory: '/data/backups' }), /Read failed/);
  assert.equal(removed, true);
});

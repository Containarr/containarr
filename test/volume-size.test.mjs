import assert from 'node:assert/strict';
import { test } from 'node:test';
import Docker from '../lib/Docker.mjs';

test('volume sizes use isolated read-only mounts for host paths and existing named volumes', async () => {
  for (const volume of ['/host/media files:/media:ro', 'config:/config']) {
    const instance = Object.create(Docker.prototype);
    const [source] = volume.split(':');
    let inspected = false;
    let removed = false;
    instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr-image' });
    instance.dockerode = Promise.resolve({
      getVolume: name => ({ inspect: async () => { assert.equal(name, source); inspected = true; } }),
      createContainer: async config => {
        assert.equal(config.Image, 'containarr-image');
        assert.deepEqual(config.Entrypoint, ['/usr/bin/du']);
        assert.deepEqual(config.Cmd, ['-sb', '--', '/volume-source']);
        assert.equal(config.HostConfig.NetworkMode, 'none');
        assert.equal(config.HostConfig.ReadonlyRootfs, true);
        assert.deepEqual(config.HostConfig.Mounts, [{
          Type: source.startsWith('/') ? 'bind' : 'volume',
          Source: source, Target: '/volume-source', ReadOnly: true,
          ...(!source.startsWith('/') ? { VolumeOptions: { NoCopy: true } } : {}),
        }]);
        assert.equal(inspected, !source.startsWith('/'));
        return {
          start: async () => {},
          wait: async () => ({ StatusCode: 0 }),
          logs: async () => {
            const output = Buffer.from('123456789\t/volume-source\n');
            const header = Buffer.alloc(8);
            header[0] = 1;
            header.writeUInt32BE(output.length, 4);
            return Buffer.concat([header, output]);
          },
          remove: async options => { assert.equal(options.force, true); removed = true; },
        };
      },
    });
    assert.equal(await instance.calculateVolumeSize({ volume }), 123456789);
    assert.equal(removed, true);
  }
});

test('invalid sources and missing named volumes never create a size calculation container', async () => {
  const instance = Object.create(Docker.prototype);
  instance.dockerode = Promise.resolve({
    getVolume: () => ({ inspect: async () => { throw new Error('Volume not found'); } }),
    createContainer: async () => assert.fail('Unexpected container'),
  });
  instance.getCurrentContainerMetadata = async () => assert.fail('Unexpected image lookup');
  for (const volume of [null, {}, '/host', '/host:relative', 'relative/path:/data', '/nul\0:/data']) {
    await assert.rejects(instance.calculateVolumeSize({ volume }), { statusCode: 400 });
  }
  await assert.rejects(instance.calculateVolumeSize({ volume: 'missing:/data' }), /Volume not found/);
});

test('zero-byte results are valid; failed or incomplete size calculations fail and clean up', async () => {
  const instance = Object.create(Docker.prototype);
  instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr-image' });
  let output = '0\t/volume-source\n';
  let status = 0;
  let startError = false;
  let removed = 0;
  instance.dockerode = Promise.resolve({
    createContainer: async () => ({
      start: async () => { if (startError) throw new Error('Start failed'); },
      wait: async () => ({ StatusCode: status }),
      logs: async () => Buffer.from(output),
      remove: async () => { removed++; },
    }),
  });
  assert.equal(await instance.calculateVolumeSize({ volume: '/data:/data' }), 0);
  for (output of ['', '-1\t/volume-source\n', '9007199254740992\t/volume-source\n']) {
    await assert.rejects(instance.calculateVolumeSize({ volume: '/data:/data' }), /invalid response/);
  }
  status = 1;
  output = 'du: Permission denied\n123\t/volume-source\n';
  await assert.rejects(instance.calculateVolumeSize({ volume: '/data:/data' }), /Permission denied/);
  startError = true;
  await assert.rejects(instance.calculateVolumeSize({ volume: '/data:/data' }), /Start failed/);
  assert.equal(removed, 6);
});

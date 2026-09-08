import assert from 'node:assert/strict';
import { test } from 'node:test';
import Docker from '../lib/Docker.mjs';

test('host and device listings preserve filenames, sort folders first, and filter prefixes', async () => {
  for (const source of ['host', 'device']) {
    const instance = Object.create(Docker.prototype);
    const publicRoot = source === 'device' ? '/dev' : '';
    let removed = 0;
    instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr-image' });
    instance.dockerode = Promise.resolve({
      createContainer: async config => {
        assert.deepEqual(config.Entrypoint, ['/bin/ls']);
        assert.equal(config.Image, 'containarr-image');
        assert.equal(config.Cmd.at(-1), '/host/');
        assert.ok(config.Cmd.includes('--zero'));
        assert.deepEqual(config.HostConfig, {
          Binds: [`${publicRoot || '/'}:/host:ro`], NetworkMode: 'none',
        });
        return {
          start: async () => {},
          wait: async () => ({ StatusCode: 0 }),
          logs: async () => {
            const payload = Buffer.from('Zoo\0.alpha\0 spaced \0line\nbreak\0$(echo nope)\0a-file\0a-folder/\0A-second/\0symlink\0');
            const header = Buffer.alloc(8);
            header[0] = 1;
            header.writeUInt32BE(payload.length, 4);
            return Buffer.concat([header, payload]);
          },
          remove: async () => { removed++; },
        };
      },
    });
    const entries = await instance.getPathSuggestions({ source, requestedPath: `${publicRoot}/` });
    assert.deepEqual(entries.slice(0, 2), [
      { path: `${publicRoot}/a-folder/`, directory: true },
      { path: `${publicRoot}/A-second/`, directory: true },
    ]);
    for (const name of ['Zoo', '.alpha', ' spaced ', 'line\nbreak', '$(echo nope)', 'a-file', 'symlink']) {
      assert.ok(entries.some(entry => entry.path === `${publicRoot}/${name}` && !entry.directory));
    }
    assert.deepEqual(await instance.getPathSuggestions({ source, requestedPath: `${publicRoot}/A` }), [
      { path: `${publicRoot}/a-folder/`, directory: true },
      { path: `${publicRoot}/A-second/`, directory: true },
      { path: `${publicRoot}/a-file`, directory: false },
    ]);
    assert.equal(removed, 2);
  }
});

test('host listings limit results after sorting and handle empty directories and listing errors', async () => {
  const instance = Object.create(Docker.prototype);
  instance.getCurrentContainerMetadata = async () => ({ Image: 'containarr-image' });
  let output = `${Array.from({ length: 110 }, (_, i) => `file-${i}`).join('\0')}\0folder/\0`;
  let status = 0;
  let removed = 0;
  instance.dockerode = Promise.resolve({
    createContainer: async config => {
      assert.equal(config.Cmd.at(-1), '/host/media/');
      return {
        start: async () => {},
        wait: async () => ({ StatusCode: status }),
        logs: async () => Buffer.from(output),
        remove: async () => { removed++; },
      };
    },
  });
  const entries = await instance.getPathSuggestions({ source: 'host', requestedPath: '/media/' });
  assert.equal(entries.length, 100);
  assert.deepEqual(entries[0], { path: '/media/folder/', directory: true });
  output = '';
  assert.deepEqual(await instance.getPathSuggestions({ source: 'host', requestedPath: '/media/' }), []);
  output = 'ls: cannot access directory: Permission denied\n';
  status = 2;
  await assert.rejects(instance.getPathSuggestions({ source: 'host', requestedPath: '/media/' }), /Permission denied/);
  assert.equal(removed, 3);
});

test('invalid paths and paths outside the mounted root never create a helper', async () => {
  const instance = Object.create(Docker.prototype);
  instance.dockerode = Promise.resolve({ createContainer: async () => assert.fail('Unexpected helper') });
  instance.getCurrentContainerMetadata = async () => assert.fail('Unexpected image lookup');
  for (const [source, requestedPath] of [
    ['host', 'relative'], ['host', '/nul\0'], ['host', '/../'],
    ['host', '/media/../../'], ['device', '/etc/'], ['device', '/devices/'],
    ['device', '/dev/../'],
  ]) {
    await assert.rejects(instance.getPathSuggestions({ source, requestedPath }));
  }
});

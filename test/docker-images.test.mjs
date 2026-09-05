import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'containarr-images-'));
process.env.DOCKER_SOCK = join(directory, 'docker.sock');
const { default: Docker } = await import('../lib/Docker.mjs');
const docker = Object.create(Docker.prototype);

test('accepts Docker names, tags, registries, digests, and local image IDs', () => {
  for (const image of [
    'alpine', 'library/alpine', 'alpine:3.21', 'alpine:Release_1.2-3',
    'ghcr.io/example/app:latest', 'localhost:5000/app',
    'registry:5000/team/app', '127.0.0.1:5000/app', '[::1]:5000/app',
    'REGISTRY.example.com/team/app', 'team/my__app--test',
    `alpine@sha256:${'a'.repeat(64)}`, `alpine:latest@sha256:${'a'.repeat(64)}`,
    `registry.example.com/app@sha512:${'a'.repeat(128)}`,
    `${'a'.repeat(255)}:${'t'.repeat(128)}@sha512:${'a'.repeat(128)}`,
    `sha256:${'a'.repeat(64)}`, 'a'.repeat(64), 'abcdef123456',
  ]) {
    assert.doesNotThrow(() => docker.validateImage(image), image);
  }
});

test('rejects malformed input before any Docker image operation', async () => {
  const guarded = Object.create(Docker.prototype);
  Object.defineProperty(guarded, 'dockerode', {
    get() { assert.fail('Invalid input reached Docker'); },
  });
  for (const image of [
    null, undefined, 42, {}, [], '', ' ', 'alpine\n', 'al pine',
    'https://ghcr.io/example/app', 'http://images', '//images', '/alpine',
    'alpine/', 'team//app', 'team/../app', 'team/./app', '../images',
    'alpine?foo=bar', 'alpine#fragment', 'alpine%2fjson', 'alpine\\app',
    'alpine\0', 'Alpine', 'team/App', 'alpine:', 'alpine:-tag',
    'alpine:one:two', `alpine:${'a'.repeat(129)}`, 'a'.repeat(256),
    'sha256:invalid', `sha256:${'a'.repeat(64)}\n`,
    'alpine@sha256:abc', `alpine@sha256:${'a'.repeat(63)}`,
    `alpine@sha256:${'A'.repeat(64)}`, 'alpine@unknown:abc',
  ]) {
    assert.throws(() => guarded.validateImage(image), { statusCode: 400 });
    await assert.rejects(guarded.getImageMetadata(image), { statusCode: 400 });
    await assert.rejects(guarded.pullImage(image), { statusCode: 400 });
    await assert.rejects(guarded.deleteImage({ imageId: image }), { statusCode: 400 });
    await assert.rejects(guarded.createContainer({ image }), { statusCode: 400 });
  }
});

test('pull parses chunked progress and a final line without a newline', async () => {
  docker.dockerode = Promise.resolve({ pull: async () => Readable.from([
    '{"status":"Down', 'loading"}\r\n\n{"status":"Done"}',
  ]) });
  assert.deepEqual(await docker.pullImage('alpine'), [{ status: 'Downloading' }, { status: 'Done' }]);
});

test('pull rejects registry errors and malformed progress instead of throwing from callbacks', async () => {
  for (const response of [
    '{"error":"manifest unknown"}\n',
    '{"errorDetail":{"message":"manifest unknown"}}',
    '<html>Bad gateway</html>\n', '{"status":', 'null\n',
  ]) {
    docker.dockerode = Promise.resolve({ pull: async () => Readable.from([response]) });
    await assert.rejects(docker.pullImage('alpine'));
  }
});

test('pull rejects request and response stream failures', async () => {
  docker.dockerode = Promise.resolve({ pull: async () => { throw new Error('ENOTFOUND registry'); } });
  await assert.rejects(docker.pullImage('alpine'), /ENOTFOUND/);
  docker.dockerode = Promise.resolve({ pull: async () => Readable.from((async function* () {
    yield '{"status":"Downloading"}\n';
    throw new Error('Connection reset');
  })()) });
  await assert.rejects(docker.pullImage('alpine'), /Connection reset/);
});

test('image path suggestions do not pull after non-404 inspect errors', async () => {
  const instance = Object.create(Docker.prototype);
  instance.dockerode = Promise.resolve({});
  instance.getImageMetadata = async () => { throw Object.assign(new Error('Invalid image'), { statusCode: 400 }); };
  instance.pullImage = async () => assert.fail('Should not pull');
  await assert.rejects(instance.getPathSuggestions({ source: 'image', requestedPath: '/', image: 'invalid/' }), { statusCode: 400 });
});

test('Docker API redirects, missing images, and broken connections stay contained', async t => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/_ping') return res.end('OK');
    if (req.url.startsWith('/containers/json')) return res.end('[]');
    if (req.url.startsWith('/containers/')) return res.end('{"Id":"containarr"}');
    if (req.url === '/images/redirect/json' || req.url.startsWith('/images/create?')) {
      res.writeHead(301, { Location: 'http://images.invalid/redirect/json' });
      return res.end();
    }
    if (req.url === '/images/disconnected/json') return req.socket.destroy();
    if (req.url === '/images/missing/json') {
      res.writeHead(404);
      return res.end('{"message":"No such image"}');
    }
    res.end('{"Id":"image"}');
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  server.listen(process.env.DOCKER_SOCK);
  await once(server, 'listening');
  const instance = new Docker();
  await instance.dockerode;
  await instance.getCurrentContainerMetadata();
  await assert.rejects(instance.getImageMetadata('redirect'), /Max redirects exceeded/);
  await assert.rejects(instance.pullImage('alpine'), /Max redirects exceeded/);
  await assert.rejects(instance.getImageMetadata('disconnected'), /socket hang up/);
  await assert.rejects(instance.getImageMetadata('missing'), { statusCode: 404 });
  const before = requests.length;
  await assert.rejects(instance.getImageMetadata('https://images/invalid'), { statusCode: 400 });
  assert.equal(requests.length, before);
  assert.deepEqual(await instance.getImageMetadata('alpine'), { Id: 'image' });
});

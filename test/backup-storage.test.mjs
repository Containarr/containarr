import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import SftpClient from 'ssh2-sftp-client';
import uploadBackup from '../lib/BackupStorage.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'containarr-storage-'));
const archivePath = path.join(root, 'snapshot.tar');
const keyPath = path.join(root, 'id_ed25519');
const storageId = '11111111-1111-4111-8111-111111111111';
const prefix = `containarr-${storageId}-`;
const older = `${prefix}2020-01-01T00-00-00.000Z-${storageId}.tar`;
const newer = `${prefix}2020-01-02T00-00-00.000Z-${storageId}.tar`;
await fs.writeFile(archivePath, 'complete backup');
await fs.writeFile(keyPath, 'test private key');
after(() => fs.rm(root, { recursive: true, force: true }));
const s3 = { endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'backups', prefix: 'nested/backups', accessKeyId: 'test-id', secretAccessKey: 'test-secret' };
const hostKey = Buffer.from('test host key');
const sftp = { host: 'example.com', port: 2222, username: 'backups', directory: '/backups', hostFingerprint: `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}` };

test('S3 publishes a complete archive before paginated retention, preserving other files and installations', async t => {
  const objects = new Map([
    [`nested/backups/${older}`, 'old'], [`nested/backups/${newer}`, 'new'],
    ['nested/backups/unrelated.tar', 'unrelated'],
    [`nested/backups/${older.replace(storageId, '22222222-2222-4222-8222-222222222222')}`, 'other installation'],
    [`nested/backups/${older}.partial`, 'partial'],
  ]);
  let uploaded;
  let pages = 0;
  t.mock.method(Upload.prototype, 'done', async function () {
    const chunks = [];
    for await (const chunk of this.params.Body) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'complete backup');
    assert.equal(this.params.ContentLength, 15);
    uploaded = this.params.Key;
    objects.set(uploaded, 'complete backup');
  });
  t.mock.method(S3Client.prototype, 'send', async command => {
    assert.ok(uploaded, 'retention must only start after upload');
    if (command.constructor.name === 'ListObjectsV2Command') {
      pages++;
      assert.equal(command.input.Prefix, `nested/backups/${prefix}`);
      if (!command.input.ContinuationToken) return { Contents: [{ Key: `nested/backups/${older}` }], IsTruncated: true, NextContinuationToken: 'page2' };
      assert.equal(command.input.ContinuationToken, 'page2');
      return { Contents: [...objects.keys()].filter(key => key !== `nested/backups/${older}`).map(Key => ({ Key })) };
    }
    assert.equal(command.constructor.name, 'DeleteObjectCommand');
    objects.delete(command.input.Key);
  });
  await uploadBackup({ strategy: 's3', target: s3, archivePath, storageId, keepBackups: 2 });
  assert.equal(pages, 2);
  assert.equal(objects.has(`nested/backups/${older}`), false);
  assert.equal(objects.has(`nested/backups/${newer}`), true);
  assert.equal(objects.size, 5);
  assert.equal(objects.get(uploaded), 'complete backup');
});

test('S3 upload failure never lists or deletes existing backups', async t => {
  t.mock.method(Upload.prototype, 'done', async () => { throw new Error('Upload failed'); });
  const send = t.mock.method(S3Client.prototype, 'send', async () => { throw new Error('Unexpected retention'); });
  await assert.rejects(uploadBackup({ strategy: 's3', target: s3, archivePath, storageId, keepBackups: 1 }), /Upload failed/);
  assert.equal(send.mock.callCount(), 0);
});

test('SFTP checks the host key and publishes by rename before deleting old backups', async t => {
  const files = new Map([[older, 'old'], [newer, 'new'], ['unrelated.tar', 'unrelated']]);
  let published;
  let closed = false;
  t.mock.method(SftpClient.prototype, 'connect', async options => {
    assert.equal(options.hostVerifier(hostKey), true);
    assert.equal(options.hostVerifier(Buffer.from('wrong host')), false);
    assert.equal(options.privateKey.toString(), 'test private key');
    assert.equal(options.port, 2222);
  });
  t.mock.method(SftpClient.prototype, 'mkdir', async directory => { assert.equal(directory, '/backups'); });
  t.mock.method(SftpClient.prototype, 'put', async (local, remote) => {
    assert.match(remote, /\.partial$/);
    files.set(path.posix.basename(remote), await fs.readFile(local, 'utf8'));
  });
  t.mock.method(SftpClient.prototype, 'rename', async (from, to) => {
    published = path.posix.basename(to);
    files.set(published, files.get(path.posix.basename(from)));
    files.delete(path.posix.basename(from));
  });
  t.mock.method(SftpClient.prototype, 'list', async () => {
    assert.ok(published);
    return [...files.keys()].map(name => ({ type: '-', name })).concat({ type: 'l', name: `${prefix}2019-01-01T00-00-00.000Z-${storageId}.tar` });
  });
  t.mock.method(SftpClient.prototype, 'delete', async remote => { files.delete(path.posix.basename(remote)); });
  t.mock.method(SftpClient.prototype, 'end', async () => { closed = true; });
  await uploadBackup({ strategy: 'sftp', target: sftp, archivePath, keyPath, storageId, keepBackups: 1 });
  assert.deepEqual([...files.values()].sort(), ['complete backup', 'unrelated']);
  assert.equal(closed, true);
});

test('SFTP failed uploads remove only their partial file and preserve old backups', async t => {
  const removed = [];
  t.mock.method(SftpClient.prototype, 'connect', async options => { assert.equal(options.hostVerifier(hostKey), true); });
  t.mock.method(SftpClient.prototype, 'mkdir', async () => {});
  t.mock.method(SftpClient.prototype, 'put', async () => { throw new Error('Disk full'); });
  t.mock.method(SftpClient.prototype, 'delete', async remote => { removed.push(remote); });
  const list = t.mock.method(SftpClient.prototype, 'list', async () => { throw new Error('Unexpected retention'); });
  const end = t.mock.method(SftpClient.prototype, 'end', async () => {});
  await assert.rejects(uploadBackup({ strategy: 'sftp', target: sftp, archivePath, keyPath, storageId, keepBackups: 1 }), /Disk full/);
  assert.equal(removed.length, 1);
  assert.match(removed[0], /\.partial$/);
  assert.equal(list.mock.callCount(), 0);
  assert.equal(end.mock.callCount(), 1);
});

test('SFTP rejects an unexpected host before uploading or pruning', async t => {
  t.mock.method(SftpClient.prototype, 'connect', async options => {
    if (!options.hostVerifier(Buffer.from('wrong host'))) throw new Error('Host key verification failed');
  });
  const put = t.mock.method(SftpClient.prototype, 'put', async () => {});
  const remove = t.mock.method(SftpClient.prototype, 'delete', async () => {});
  t.mock.method(SftpClient.prototype, 'end', async () => {});
  await assert.rejects(uploadBackup({ strategy: 'sftp', target: sftp, archivePath, keyPath, storageId, keepBackups: 1 }), /host key has changed/);
  assert.equal(put.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});


test('SFTP remembers the first authenticated host key and rejects later changes', async t => {
  const target = { ...sftp, host: 'first-contact.example.com' };
  delete target.hostFingerprint;
  let presented = hostKey;
  let uploads = 0;
  t.mock.method(SftpClient.prototype, 'connect', async options => {
    if (!options.hostVerifier(presented)) throw new Error('Host verification failed');
  });
  t.mock.method(SftpClient.prototype, 'mkdir', async () => {});
  t.mock.method(SftpClient.prototype, 'put', async () => { uploads++; });
  t.mock.method(SftpClient.prototype, 'rename', async () => {});
  t.mock.method(SftpClient.prototype, 'list', async () => []);
  t.mock.method(SftpClient.prototype, 'end', async () => {});
  await uploadBackup({ strategy: 'sftp', target, archivePath, keyPath, storageId, keepBackups: 1 });
  await uploadBackup({ strategy: 'sftp', target, archivePath, keyPath, storageId, keepBackups: 1 });
  assert.equal(uploads, 2);
  presented = Buffer.from('replacement host key');
  await assert.rejects(uploadBackup({ strategy: 'sftp', target, archivePath, keyPath, storageId, keepBackups: 1 }), /host key has changed/);
  assert.equal(uploads, 2);
  presented = hostKey;
  await uploadBackup({ strategy: 'sftp', target, archivePath, keyPath, storageId, keepBackups: 1 });
  assert.equal(uploads, 3);
});

test('SFTP does not remember a key when authentication fails', async t => {
  const target = { ...sftp, host: 'failed-auth.example.com' };
  delete target.hostFingerprint;
  t.mock.method(SftpClient.prototype, 'connect', async options => {
    assert.equal(options.hostVerifier(hostKey), true);
    throw new Error('Authentication failed');
  });
  t.mock.method(SftpClient.prototype, 'end', async () => {});
  await assert.rejects(uploadBackup({ strategy: 'sftp', target, archivePath, keyPath, storageId, keepBackups: 1 }), /Authentication failed/);
  const hostPath = path.join(root, 'sftp_known_hosts', createHash('sha256').update(JSON.stringify([target.host, target.port])).digest('hex'));
  await assert.rejects(fs.access(hostPath), { code: 'ENOENT' });
});

test('S3 detects common signing regions, defaults custom endpoints, and honors overrides', async t => {
  let expected;
  t.mock.method(Upload.prototype, 'done', async function () {
    assert.equal(await this.client.config.region(), expected);
  });
  t.mock.method(S3Client.prototype, 'send', async () => ({ Contents: [] }));
  for (const [endpoint, region, inferred] of [
    ['https://s3.eu-west-1.amazonaws.com', '', 'eu-west-1'],
    ['https://s3-us-west-2.amazonaws.com', '', 'us-west-2'],
    ['https://s3.dualstack.eu-west-1.amazonaws.com', '', 'eu-west-1'],
    ['https://s3.us-west-004.backblazeb2.com', '', 'us-west-004'],
    ['https://example.r2.cloudflarestorage.com', '', 'auto'],
    ['https://s3.example.com', '', 'us-east-1'],
    ['https://s3.example.com', 'custom-region', 'custom-region'],
  ]) {
    expected = inferred;
    await uploadBackup({ strategy: 's3', target: { ...s3, endpoint, region }, archivePath, storageId, keepBackups: 1 });
  }
});

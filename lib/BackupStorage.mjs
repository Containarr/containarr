import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import SftpClient from 'ssh2-sftp-client';

export default async function uploadBackup({ strategy, target, archivePath, keyPath, storageId, keepBackups }) {
  if (!/^[a-f0-9-]{36}$/.test(storageId)) throw new Error('Invalid backup storage ID.');
  const prefix = `containarr-${storageId}-`;
  const filename = `${prefix}${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.tar`;
  const pattern = new RegExp(`^${prefix}\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.\\d{3}Z-[a-f0-9-]{36}\\.tar$`);

  if (strategy === 's3') {
    const hostname = new URL(target.endpoint).hostname;
    const region = target.region || (hostname.endsWith('.r2.cloudflarestorage.com') ? 'auto'
      : hostname.match(/^s3[.-](?:dualstack\.)?([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?$/)?.[1]
        ?? hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/)?.[1] ?? 'us-east-1');
    const client = new S3Client({
      endpoint: target.endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    const directory = target.prefix ? `${target.prefix}/` : '';
    const body = fs.createReadStream(archivePath);
    try {
      await new Upload({
        client,
        params: {
          Bucket: target.bucket, Key: `${directory}${filename}`, Body: body,
          ContentLength: (await fs.promises.stat(archivePath)).size,
          ContentType: 'application/x-tar',
        },
        queueSize: 2,
        leavePartsOnError: false,
      }).done();

      // Only expire this installation's completed backups, after the new upload succeeds.
      const backups = [];
      let continuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: target.bucket, Prefix: `${directory}${prefix}`, ContinuationToken: continuationToken,
        }));
        for (const object of page.Contents ?? []) {
          if (object.Key?.startsWith(directory) && pattern.test(object.Key.slice(directory.length))) backups.push(object.Key);
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !continuationToken) throw new Error('S3 returned an incomplete backup listing.');
      } while (continuationToken);
      const previous = backups.filter(key => key !== `${directory}${filename}`).sort().reverse();
      for (const key of previous.slice(keepBackups - 1)) {
        await client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: key }));
      }
    } finally {
      body.destroy();
      client.destroy();
    }
  } else if (strategy === 'sftp') {
    const client = new SftpClient();
    const temporaryPath = path.posix.join(target.directory, `.${filename}.partial`);
    const hostsDirectory = path.join(path.dirname(keyPath), 'sftp_known_hosts');
    await fs.promises.mkdir(hostsDirectory, { recursive: true, mode: 0o700 });
    const hostPath = path.join(hostsDirectory, createHash('sha256').update(JSON.stringify([target.host.toLowerCase(), target.port])).digest('hex'));
    let expected;
    try {
      expected = await fs.promises.readFile(hostPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Preserve manually pinned keys from earlier configurations.
      if (target.hostFingerprint) expected = Buffer.from(target.hostFingerprint.slice(7), 'base64');
    }
    let observed;
    let hostChanged = false;
    let connected = false;
    let published = false;
    try {
      await client.connect({
        host: target.host, port: target.port, username: target.username,
        privateKey: await fs.promises.readFile(keyPath),
        readyTimeout: 20_000,
        hostVerifier: key => {
          const actual = createHash('sha256').update(key).digest();
          observed ??= actual;
          const trusted = expected ?? observed;
          const matches = actual.length === trusted.length && timingSafeEqual(actual, trusted);
          hostChanged ||= !matches;
          return matches;
        },
      });
      connected = true;
      if (!observed) throw new Error('The SFTP server did not provide a host key.');
      try {
        await fs.promises.writeFile(hostPath, observed, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const saved = await fs.promises.readFile(hostPath);
        if (saved.length !== observed.length || !timingSafeEqual(saved, observed)) {
          throw new Error('The SFTP server host key has changed. Verify the server before reconnecting.');
        }
      }
      await client.mkdir(target.directory, true);
      await client.put(archivePath, temporaryPath);
      await client.rename(temporaryPath, path.posix.join(target.directory, filename));
      published = true;
      const previous = (await client.list(target.directory))
        .filter(entry => entry.type === '-' && entry.name !== filename && pattern.test(entry.name))
        .map(entry => entry.name).sort().reverse();
      for (const name of previous.slice(keepBackups - 1)) {
        await client.delete(path.posix.join(target.directory, name));
      }
    } catch (error) {
      if (hostChanged) throw new Error('The SFTP server host key has changed. Verify the server before reconnecting.');
      throw error;
    } finally {
      if (connected && !published) await client.delete(temporaryPath).catch(() => {});
      await client.end().catch(() => {});
    }
  } else {
    throw new Error('Unsupported backup strategy.');
  }
}

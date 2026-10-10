import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';
import debug from 'debug';
import { createHash, randomUUID } from 'node:crypto';
import uploadBackup from './BackupStorage.mjs';

import SQLite from '../services/SQLite.mjs';
import Docker from '../services/Docker.mjs';
import Settings from '../services/Settings.mjs';

import { BACKUP_DIRECTORY } from '../config.mjs';

const LFS_ATTRIBUTES = 'volumes/*.tar.gz filter=lfs diff=lfs merge=lfs -text\n';

export default class Backups {

  debug = debug('Backups');

  #backupPromise = null;
  #scheduleTimer = null;
  #lastAttemptAt = 0;
  #status = {
    backingUp: false,
    error: null,
  };

  start() {
    if (this.#scheduleTimer) return;
    this.#scheduleTimer = setInterval(() => {
      this.checkSchedule().catch(error => this.debug(error));
    }, 60_000);
    this.#scheduleTimer.unref();
    this.checkSchedule().catch(error => this.debug(error));
  }

  stop() {
    clearInterval(this.#scheduleTimer);
    this.#scheduleTimer = null;
  }

  async checkSchedule() {
    const [savedIntervalHours, lastBackupAt, scheduleStartedAt, repositoryUrl, strategy, s3, sftp] = await Promise.all([
      Settings.getSetting('backup_interval_hours'),
      Settings.getSetting('backup_last_backup_at'),
      Settings.getSetting('backup_schedule_started_at'),
      Settings.getSetting('backup_repository_url'),
      Settings.getSetting('backup_strategy'),
      Settings.getSetting('backup_s3'),
      Settings.getSetting('backup_sftp'),
    ]);
    const intervalHours = savedIntervalHours ?? 6;
    const configured = strategy === 's3' ? Boolean(s3?.bucket) : strategy === 'sftp' ? Boolean(sftp?.host) : Boolean(repositoryUrl);
    if (!configured || !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8760) return;
    const lastRun = Math.max(Date.parse(lastBackupAt) || 0, Date.parse(scheduleStartedAt) || 0, this.#lastAttemptAt);
    if (!lastRun) {
      await Settings.setSetting('backup_schedule_started_at', new Date(Date.now()).toISOString());
      return;
    }
    if (Date.now() - lastRun >= intervalHours * 3_600_000) await this.backup();
  }

  async getSettings() {
    const keyPath = path.join(BACKUP_DIRECTORY, 'id_ed25519');
    await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });

    try {
      await fs.access(keyPath);
    } catch {
      await util.promisify(child_process.execFile)('ssh-keygen', [
        '-q',
        '-t', 'ed25519',
        '-N', '',
        '-C', 'containarr-backup',
        '-f', keyPath,
      ]);
    }
    await fs.chmod(keyPath, 0o600);

    try {
      await fs.access(`${keyPath}.pub`);
    } catch {
      const { stdout } = await util.promisify(child_process.execFile)('ssh-keygen', [
        '-y',
        '-f', keyPath,
      ]);
      await fs.writeFile(`${keyPath}.pub`, `${stdout.trim()} containarr-backup\n`);
    }

    const App = await SQLite.getModelApp();
    const [repositoryUrl, branch, lastBackupAt, publicKey, intervalHours, apps, strategy, s3, sftp, keepBackups] = await Promise.all([
      Settings.getSetting('backup_repository_url'),
      Settings.getSetting('backup_branch'),
      Settings.getSetting('backup_last_backup_at'),
      fs.readFile(`${keyPath}.pub`, 'utf8'),
      Settings.getSetting('backup_interval_hours'),
      App.findAll({ order: [['name', 'ASC'], ['id', 'ASC']] }),
      Settings.getSetting('backup_strategy'),
      Settings.getSetting('backup_s3'),
      Settings.getSetting('backup_sftp'),
      Settings.getSetting('backup_keep_backups'),
    ]);

    return {
      strategy: strategy ?? 'git',
      keepBackups: keepBackups ?? 7,
      s3: {
        endpoint: s3?.endpoint ?? '', region: s3?.region ?? '',
        bucket: s3?.bucket ?? '', prefix: s3?.prefix ?? 'containarr',
        accessKeyId: s3?.accessKeyId ?? '', hasSecretAccessKey: Boolean(s3?.secretAccessKey),
      },
      sftp: { host: sftp?.host ?? '', port: sftp?.port ?? 22, username: sftp?.username ?? '', directory: sftp?.directory ?? '' },
      repositoryUrl: repositoryUrl ?? '',
      branch: branch ?? 'main',
      intervalHours: intervalHours ?? 6,
      publicKey: publicKey.trim(),
      configured: strategy === 's3' ? Boolean(s3?.bucket) : strategy === 'sftp' ? Boolean(sftp?.host) : Boolean(repositoryUrl),
      lastBackupAt,
      volumes: apps.flatMap(app => [...new Set(app.backupVolumes ?? [])].map(volume => ({
        appId: app.id,
        appName: app.name,
        hasLogo: Boolean(app.logo),
        logoVersion: app.logo ? createHash('sha256').update(app.logo).digest('hex') : null,
        volume,
      }))),
      ...this.#status,
    };
  }

  async excludeVolume({ app, volume }) {
    if (!app?.db || typeof volume !== 'string' || !volume) {
      throw Object.assign(new Error('Choose a backed up volume.'), { statusCode: 400 });
    }

    if (!(app.db.backupVolumes ?? []).includes(volume)) {
      throw Object.assign(new Error('Backed up volume not found.'), { statusCode: 404 });
    }

    app.db.backupVolumes = app.db.backupVolumes.filter(selectedVolume => selectedVolume !== volume);
    await app.db.save();
    return this.getSettings();
  }

  async setSettings({ strategy = 'git', repositoryUrl, branch = 'main', intervalHours, s3, sftp, keepBackups }) {
    if (!['git', 's3', 'sftp'].includes(strategy)) throw new TypeError('Choose a valid backup strategy.');
    const normalizedRepositoryUrl = typeof repositoryUrl === 'string'
      ? repositoryUrl.trim()
      : '';
    if (strategy === 'git' && (
      !normalizedRepositoryUrl
      || !(
        /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:.+$/.test(normalizedRepositoryUrl)
        || /^ssh:\/\/[A-Za-z0-9._-]+@[A-Za-z0-9.:[\]-]+\/.+$/.test(normalizedRepositoryUrl)
      )
      || /[\r\n\0\s]/.test(normalizedRepositoryUrl)
    )) {
      throw new TypeError('Enter a valid SSH repository URL.');
    }
    if (strategy === 'git' && (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch))) {
      throw new TypeError('Enter a valid Git branch.');
    }

    intervalHours ??= await Settings.getSetting('backup_interval_hours') ?? 6;
    if (!Number.isInteger(intervalHours) || intervalHours < 0 || intervalHours > 8760) {
      throw new TypeError('Backup interval must be a whole number from 0 to 8760 hours.');
    }
    keepBackups ??= await Settings.getSetting('backup_keep_backups') ?? 7;
    if (!Number.isInteger(keepBackups) || keepBackups < 1 || keepBackups > 1000) {
      throw new TypeError('Keep backups must be a whole number from 1 to 1000.');
    }
    let target;
    if (strategy === 's3') {
      if (!s3 || typeof s3 !== 'object') throw new TypeError('Enter your S3 settings.');
      const region = s3.region ?? '';
      if (typeof region !== 'string' || /[\r\n\0]/.test(region)) throw new TypeError('Enter a valid S3 region.');
      for (const field of ['endpoint', 'bucket', 'prefix', 'accessKeyId']) {
        if (typeof s3[field] !== 'string' || /[\r\n\0]/.test(s3[field])) throw new TypeError(`Enter a valid S3 ${field}.`);
      }
      let endpoint;
      try { endpoint = new URL(s3.endpoint); } catch { throw new TypeError('Enter a valid S3 endpoint URL.'); }
      if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
        throw new TypeError('Enter an HTTP or HTTPS S3 endpoint without a path, credentials, or query.');
      }
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3.bucket) || !s3.accessKeyId.trim()) {
        throw new TypeError('Enter an S3 bucket name and access key ID.');
      }
      const previous = await Settings.getSetting('backup_s3');
      const secretAccessKey = s3.secretAccessKey === undefined || s3.secretAccessKey === ''
        ? previous?.secretAccessKey : s3.secretAccessKey;
      if (typeof secretAccessKey !== 'string' || !secretAccessKey.trim() || /[\r\n\0]/.test(secretAccessKey)) {
        throw new TypeError('Enter an S3 secret access key.');
      }
      target = {
        endpoint: endpoint.origin, region: region.trim(), bucket: s3.bucket,
        prefix: s3.prefix.replace(/^\/+|\/+$/g, ''), accessKeyId: s3.accessKeyId.trim(), secretAccessKey,
      };
    } else if (strategy === 'sftp') {
      if (!sftp || typeof sftp !== 'object'
        || typeof sftp.host !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(sftp.host)
        || typeof sftp.username !== 'string' || !sftp.username.trim() || /[\r\n\0]/.test(sftp.username)
        || !Number.isInteger(sftp.port) || sftp.port < 1 || sftp.port > 65535
        || typeof sftp.directory !== 'string' || !sftp.directory.startsWith('/') || /[\r\n\0]/.test(sftp.directory)) {
        throw new TypeError('Enter a valid SFTP host, port, username, and absolute directory.');
      }
      const previous = await Settings.getSetting('backup_sftp');
      target = {
        host: sftp.host, port: sftp.port, username: sftp.username.trim(),
        directory: path.posix.normalize(sftp.directory),
        ...(previous?.host === sftp.host && previous?.port === sftp.port && previous?.hostFingerprint
          ? { hostFingerprint: previous.hostFingerprint } : {}),
      };
    }
    await this.#backupPromise?.catch(() => {});
    const previousRepositoryUrl = await Settings.getSetting('backup_repository_url');
    const previousStrategy = await Settings.getSetting('backup_strategy') ?? 'git';
    const previousTarget = strategy === 'git' ? null : await Settings.getSetting(`backup_${strategy}`);
    if (previousStrategy !== strategy || (strategy === 'git'
      ? previousRepositoryUrl !== normalizedRepositoryUrl || (await Settings.getSetting('backup_branch') ?? 'main') !== branch
      : JSON.stringify(previousTarget) !== JSON.stringify(target))) {
      await Settings.setSetting('backup_last_backup_at', null);
      this.#status.error = null;
    }
    await Settings.setSetting('backup_schedule_started_at', new Date(Date.now()).toISOString());
    await Settings.setSetting('backup_strategy', strategy);
    await Settings.setSetting('backup_keep_backups', keepBackups);
    if (strategy === 'git') {
      await Settings.setSetting('backup_repository_url', normalizedRepositoryUrl);
      await Settings.setSetting('backup_branch', branch);
    } else {
      await Settings.setSetting(`backup_${strategy}`, target);
    }
    await Settings.setSetting('backup_interval_hours', intervalHours);

    if (previousRepositoryUrl && previousRepositoryUrl !== normalizedRepositoryUrl) {
      await fs.rm(path.join(BACKUP_DIRECTORY, 'repository'), {
        recursive: true,
        force: true,
      });
    }

    return this.getSettings();
  }

  async backup() {
    this.#backupPromise = this.#backupPromise || Promise.resolve().then(async () => {
      const repositoryUrl = await Settings.getSetting('backup_repository_url');
      const strategy = await Settings.getSetting('backup_strategy') ?? 'git';
      const target = strategy === 'git' ? null : await Settings.getSetting(`backup_${strategy}`);
      if (strategy === 'git' ? !repositoryUrl : !target) return;
      this.#lastAttemptAt = Date.now();

      const branch = await Settings.getSetting('backup_branch') || 'main';
      const keyPath = path.join(BACKUP_DIRECTORY, 'id_ed25519');
      const repositoryPath = path.join(BACKUP_DIRECTORY, 'repository');
      const snapshotPath = path.join(repositoryPath, 'db.sqlite');
      const environment = {
        ...process.env,
        GIT_LFS_SKIP_SMUDGE: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${path.join(BACKUP_DIRECTORY, 'known_hosts')}"`,
      };

      this.#status = {
        ...this.#status,
        backingUp: true,
        error: null,
      };
      this.debug(`Backing up using ${strategy}`);

      try {
        await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });
        await fs.rm(repositoryPath, { recursive: true, force: true });
        await this.getSettings();
        await fs.mkdir(repositoryPath, { recursive: true });
        if (strategy === 'git') {
          await util.promisify(child_process.execFile)(
            'git',
            ['init', '--quiet', repositoryPath],
            { env: environment },
          );

          await util.promisify(child_process.execFile)(
            'git',
            ['remote', 'add', 'origin', repositoryUrl],
            { cwd: repositoryPath, env: environment },
          );
          await util.promisify(child_process.execFile)(
            'git',
            ['config', 'user.name', 'Containarr'],
            { cwd: repositoryPath, env: environment },
          );
          await util.promisify(child_process.execFile)(
            'git',
            ['config', 'user.email', 'backup@containarr.com'],
            { cwd: repositoryPath, env: environment },
          );
          await util.promisify(child_process.execFile)(
            'git',
            ['lfs', 'install', '--local'],
            { cwd: repositoryPath, env: environment },
          );

          let remoteBranchExists = false;
          try {
            await util.promisify(child_process.execFile)(
              'git',
              ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${branch}`],
              { cwd: repositoryPath, env: environment },
            );
            remoteBranchExists = true;
          } catch (error) {
            if (error.code !== 2) throw error;
          }

          if (remoteBranchExists) {
            await util.promisify(child_process.execFile)(
              'git',
              ['fetch', '--depth=1', 'origin', branch],
              { cwd: repositoryPath, env: environment },
            );
            const { stdout } = await util.promisify(child_process.execFile)(
              'git',
              ['ls-tree', '--name-only', '-r', 'FETCH_HEAD'],
              { cwd: repositoryPath, env: environment },
            );
            const files = stdout.trim().split('\n').filter(Boolean);
            if (files.some(file => !/^(?:\.gitattributes|db\.sqlite|volumes\/manifest\.json|volumes\/[a-f0-9]{64}\.tar\.gz)$/.test(file))) {
              throw new Error('The backup repository must be empty or contain only Containarr backup files.');
            }
            if (files.includes('.gitattributes')) {
              const { stdout: attributes } = await util.promisify(child_process.execFile)(
                'git',
                ['show', 'FETCH_HEAD:.gitattributes'],
                { cwd: repositoryPath, env: environment },
              );
              if (attributes !== LFS_ATTRIBUTES) {
                throw new Error('The backup repository contains unsupported Git LFS attributes.');
              }
            }
            await util.promisify(child_process.execFile)(
              'git',
              ['checkout', '-f', '-B', branch, 'FETCH_HEAD'],
              { cwd: repositoryPath, env: environment },
            );
          } else {
            await util.promisify(child_process.execFile)(
              'git',
              ['symbolic-ref', 'HEAD', `refs/heads/${branch}`],
              { cwd: repositoryPath, env: environment },
            );
          }

          const { stdout: trackedFilesOutput } = await util.promisify(child_process.execFile)(
            'git',
            ['ls-files'],
            { cwd: repositoryPath, env: environment },
          );
          const trackedFiles = trackedFilesOutput.trim().split('\n').filter(Boolean);
          if (trackedFiles.some(file => !/^(?:\.gitattributes|db\.sqlite|volumes\/manifest\.json|volumes\/[a-f0-9]{64}\.tar\.gz)$/.test(file))) {
            throw new Error('The backup repository must be empty or contain only Containarr backup files.');
          }
          await fs.writeFile(path.join(repositoryPath, '.gitattributes'), LFS_ATTRIBUTES);
        }

        // Rebuild the snapshot so removed or deselected volumes disappear from the latest backup.
        const volumesPath = path.join(repositoryPath, 'volumes');
        await fs.rm(volumesPath, { recursive: true, force: true });
        await fs.mkdir(volumesPath);
        const App = await SQLite.getModelApp();
        const apps = await App.findAll({ order: [['id', 'ASC']] });
        const manifest = { version: 1, volumes: [] };
        for (const app of apps) {
          const configuredVolumes = Array.isArray(app.dockerVolumes)
            ? app.dockerVolumes : Object.values(app.dockerVolumes ?? {});
          for (const volume of new Set(app.backupVolumes ?? [])) {
            if (!configuredVolumes.includes(volume)) {
              throw new Error(`A selected backup volume is no longer configured for ${app.name}.`);
            }
            const filename = `${createHash('sha256').update(JSON.stringify([app.id, volume])).digest('hex')}.tar.gz`;
            try {
              await Docker.archiveVolume({
                volume,
                destination: path.join(volumesPath, filename),
                backupDirectory: BACKUP_DIRECTORY,
              });
            } catch (error) {
              throw new Error(`Could not back up ${app.name} (${volume}): ${error.message}`);
            }
            manifest.volumes.push({ appId: app.id, appName: app.name, volume, archive: filename });
          }
        }
        await fs.writeFile(path.join(volumesPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

        let storageId;
        if (strategy !== 'git') {
          storageId = await Settings.getSetting('backup_storage_id');
          if (!storageId) {
            storageId = randomUUID();
            await Settings.setSetting('backup_storage_id', storageId);
          }
        }
        await fs.rm(snapshotPath, { force: true });
        const sequelize = await SQLite.sequelize;
        await sequelize.query(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);

        if (strategy === 'git') {
          await util.promisify(child_process.execFile)(
            'git',
            ['add', '-A', '--', '.gitattributes', 'db.sqlite', 'volumes'],
            { cwd: repositoryPath, env: environment },
          );

          let changed = true;
          try {
            await util.promisify(child_process.execFile)(
              'git',
              ['diff', '--cached', '--quiet'],
              { cwd: repositoryPath, env: environment },
            );
            changed = false;
          } catch (error) {
            if (error.code !== 1) throw error;
          }

          if (changed) {
            await util.promisify(child_process.execFile)(
              'git',
              ['commit', '-m', `Backup ${new Date().toISOString()}`],
              { cwd: repositoryPath, env: environment },
            );
          }

          await util.promisify(child_process.execFile)(
            'git',
            ['push', '-u', 'origin', branch],
            { cwd: repositoryPath, env: environment },
          );
        } else {
          const archivePath = path.join(repositoryPath, 'snapshot.tar');
          await util.promisify(child_process.execFile)(
            'tar', ['-cf', archivePath, '-C', repositoryPath, 'db.sqlite', 'volumes'],
          );
          await uploadBackup({
            strategy, target, archivePath, keyPath, storageId,
            keepBackups: await Settings.getSetting('backup_keep_backups') ?? 7,
          });
        }

        const lastBackupAt = new Date().toISOString();
        await Settings.setSetting('backup_last_backup_at', lastBackupAt);
        this.#status = {
          backingUp: false,
          error: null,
        };
        this.debug('Backup completed');
      } catch (error) {
        this.#status = {
          ...this.#status,
          backingUp: false,
          error: error.stderr?.trim() || error.message,
        };
        throw error;
      } finally {
        await fs.rm(repositoryPath, { recursive: true, force: true }).catch(error => {
          this.debug(`Could not remove temporary backup repository: ${error.message}`);
        });
      }
    }).finally(() => {
      this.#backupPromise = null;
    });

    return this.#backupPromise;
  }

}

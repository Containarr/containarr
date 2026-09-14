import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';
import debug from 'debug';
import { createHash } from 'node:crypto';

import SQLite from '../services/SQLite.mjs';
import Docker from '../services/Docker.mjs';
import Settings from '../services/Settings.mjs';

import { BACKUP_DIRECTORY } from '../config.mjs';

export default class Backups {

  debug = debug('Backups');

  #backupPromise = null;
  #backupTimer = null;
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
    clearTimeout(this.#backupTimer);
    this.#scheduleTimer = null;
  }

  async checkSchedule() {
    const [savedIntervalHours, lastBackupAt] = await Promise.all([
      Settings.getSetting('backup_interval_hours'),
      Settings.getSetting('backup_last_backup_at'),
    ]);
    const intervalHours = savedIntervalHours ?? 6;
    if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8760) return;
    const lastRun = Math.max(Date.parse(lastBackupAt) || 0, this.#lastAttemptAt);
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

    const [repositoryUrl, branch, lastBackupAt, publicKey, intervalHours] = await Promise.all([
      Settings.getSetting('backup_repository_url'),
      Settings.getSetting('backup_branch'),
      Settings.getSetting('backup_last_backup_at'),
      fs.readFile(`${keyPath}.pub`, 'utf8'),
      Settings.getSetting('backup_interval_hours'),
    ]);

    return {
      repositoryUrl: repositoryUrl ?? '',
      branch: branch ?? 'main',
      intervalHours: intervalHours ?? 6,
      publicKey: publicKey.trim(),
      configured: Boolean(repositoryUrl),
      lastBackupAt,
      ...this.#status,
    };
  }

  async setSettings({ repositoryUrl, branch = 'main', intervalHours }) {
    const normalizedRepositoryUrl = typeof repositoryUrl === 'string'
      ? repositoryUrl.trim()
      : '';
    if (
      !normalizedRepositoryUrl
      || !(
        /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:.+$/.test(normalizedRepositoryUrl)
        || /^ssh:\/\/[A-Za-z0-9._-]+@[A-Za-z0-9.:[\]-]+\/.+$/.test(normalizedRepositoryUrl)
      )
      || /[\r\n\0\s]/.test(normalizedRepositoryUrl)
    ) {
      throw new TypeError('Enter a valid SSH repository URL.');
    }
    if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
      throw new TypeError('Enter a valid Git branch.');
    }

    intervalHours ??= await Settings.getSetting('backup_interval_hours') ?? 6;
    if (!Number.isInteger(intervalHours) || intervalHours < 0 || intervalHours > 8760) {
      throw new TypeError('Backup interval must be a whole number from 0 to 8760 hours.');
    }
    await this.#backupPromise?.catch(() => {});
    const previousRepositoryUrl = await Settings.getSetting('backup_repository_url');
    await Settings.setSetting('backup_repository_url', normalizedRepositoryUrl);
    await Settings.setSetting('backup_branch', branch);
    await Settings.setSetting('backup_interval_hours', intervalHours);

    if (previousRepositoryUrl && previousRepositoryUrl !== normalizedRepositoryUrl) {
      await fs.rm(path.join(BACKUP_DIRECTORY, 'repository'), {
        recursive: true,
        force: true,
      });
    }

    try {
      await this.backup();
    } catch {}
    return this.getSettings();
  }

  backupSoon() {
    clearTimeout(this.#backupTimer);
    this.#backupTimer = setTimeout(() => {
      this.backup().catch(error => this.debug(error));
    }, 3000);
  }

  async backup() {
    this.#backupPromise = this.#backupPromise || Promise.resolve().then(async () => {
      const repositoryUrl = await Settings.getSetting('backup_repository_url');
      if (!repositoryUrl) return;
      this.#lastAttemptAt = Date.now();

      const branch = await Settings.getSetting('backup_branch') || 'main';
      const keyPath = path.join(BACKUP_DIRECTORY, 'id_ed25519');
      const repositoryPath = path.join(BACKUP_DIRECTORY, 'repository');
      const snapshotPath = path.join(repositoryPath, 'db.sqlite');
      const environment = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${path.join(BACKUP_DIRECTORY, 'known_hosts')}"`,
      };

      this.#status = {
        ...this.#status,
        backingUp: true,
        error: null,
      };
      this.debug(`Backing up to ${repositoryUrl}`);

      try {
        await this.getSettings();
        await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });

        try {
          await fs.access(path.join(repositoryPath, '.git'));
        } catch {
          await fs.rm(repositoryPath, { recursive: true, force: true });
          await util.promisify(child_process.execFile)(
            'git',
            ['clone', '--no-checkout', '--', repositoryUrl, repositoryPath],
            { env: environment },
          );
        }

        await util.promisify(child_process.execFile)(
          'git',
          ['remote', 'set-url', 'origin', repositoryUrl],
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
            ['fetch', 'origin', branch],
            { cwd: repositoryPath, env: environment },
          );
          const { stdout } = await util.promisify(child_process.execFile)(
            'git',
            ['ls-tree', '--name-only', '-r', 'FETCH_HEAD'],
            { cwd: repositoryPath, env: environment },
          );
          const files = stdout.trim().split('\n').filter(Boolean);
          if (files.some(file => !/^(?:db\.sqlite|volumes\/manifest\.json|volumes\/[a-f0-9]{64}\.tar\.gz)$/.test(file))) {
            throw new Error('The backup repository must be empty or contain only Containarr backup files.');
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
        if (trackedFiles.some(file => !/^(?:db\.sqlite|volumes\/manifest\.json|volumes\/[a-f0-9]{64}\.tar\.gz)$/.test(file))) {
          throw new Error('The backup repository must be empty or contain only Containarr backup files.');
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

        await fs.rm(snapshotPath, { force: true });
        const sequelize = await SQLite.sequelize;
        await sequelize.query(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);

        await util.promisify(child_process.execFile)(
          'git',
          ['add', '-A', '--', 'db.sqlite', 'volumes'],
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

        const lastBackupAt = new Date().toISOString();
        await Settings.setSetting('backup_last_backup_at', lastBackupAt);
        this.#status = {
          backingUp: false,
          error: null,
        };
        this.debug(changed ? 'Backup pushed' : 'Backup is already current');
      } catch (error) {
        this.#status = {
          ...this.#status,
          backingUp: false,
          error: error.stderr?.trim() || error.message,
        };
        throw error;
      }
    }).finally(() => {
      this.#backupPromise = null;
    });

    return this.#backupPromise;
  }

}

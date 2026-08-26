import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';
import debug from 'debug';

import SQLite from '../services/SQLite.mjs';
import Settings from '../services/Settings.mjs';

import { BACKUP_DIRECTORY } from '../config.mjs';

export default class Backups {

  debug = debug('Backups');

  #backupPromise = null;
  #backupTimer = null;
  #status = {
    backingUp: false,
    lastBackupAt: null,
    error: null,
  };

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

    const [repositoryUrl, branch, publicKey] = await Promise.all([
      Settings.getSetting('backup_repository_url'),
      Settings.getSetting('backup_branch'),
      fs.readFile(`${keyPath}.pub`, 'utf8'),
    ]);

    return {
      repositoryUrl: repositoryUrl ?? '',
      branch: branch ?? 'main',
      publicKey: publicKey.trim(),
      configured: Boolean(repositoryUrl),
      ...this.#status,
    };
  }

  async setSettings({ repositoryUrl, branch = 'main' }) {
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

    const previousRepositoryUrl = await Settings.getSetting('backup_repository_url');
    await Settings.setSetting('backup_repository_url', normalizedRepositoryUrl);
    await Settings.setSetting('backup_branch', branch);

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
          if (files.some(file => file !== 'db.sqlite')) {
            throw new Error('The backup repository must be empty or contain only db.sqlite.');
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
        if (trackedFiles.some(file => file !== 'db.sqlite')) {
          throw new Error('The backup repository must be empty or contain only db.sqlite.');
        }

        await fs.rm(snapshotPath, { force: true });
        const sequelize = await SQLite.sequelize;
        await sequelize.query(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);

        await util.promisify(child_process.execFile)(
          'git',
          ['add', '--', 'db.sqlite'],
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

        this.#status = {
          backingUp: false,
          lastBackupAt: new Date().toISOString(),
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

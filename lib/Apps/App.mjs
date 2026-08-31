import debug from 'debug';

import Docker from '../../services/Docker.mjs';

const SYNC_INTERVAL = 1000; // 1s
const UPDATE_INTERVAL = 1000 * 60 * 60 * 6; // 6h
const UPDATE_INITIAL_DELAY = 1000 * 30; // 30s

export default class App {

  get id() {
    return this.db.id;
  }

  get name() {
    return this.db.name ?? null;
  }

  get subdomain() {
    return this.db.subdomain ?? null;
  }

  get ip() {
    if (this.dockerNetworkMode === 'host') return null;
    return Object.values(this.#containerMetadata?.NetworkSettings?.Networks ?? {})
      .find(network => network?.IPAddress)?.IPAddress
      || this.#containerMetadata?.NetworkSettings?.IPAddress
      || null;
  }

  get dockerNetworkMode() {
    return this.db.dockerNetworkMode ?? 'bridge';
  }

  get port() {
    return this.db.port ?? null;
  }

  get url() {
    if (this.ip && this.port) return `http://${this.ip}:${this.port}`;
    return null;
  }

  get registryId() {
    return this.db.registryId ?? null;
  }

  get registryVersion() {
    return this.db.registryVersion ?? null;
  }

  get hasLogo() {
    return Boolean(this.db.logo);
  }

  get autoUpdate() {
    return this.db.autoUpdate ?? false;
  }

  get disabled() {
    return this.db.disabled ?? false;
  }

  get policyId() {
    return this.db.policyId ?? 'public';
  }

  get tls() {
    return this.db.tls ?? null;
  }

  get containerId() {
    return this.#containerMetadata?.Id || null;
  }

  get state() {
    return this.#containerMetadata?.State || null;
  }

  get containerError() {
    return this.db.containerError ?? null;
  }

  #syncing = false;
  #changingContainer = false;
  #containerInstance = null;
  #containerMetadata = null;
  #imageUpdate = {
    status: 'not_checked',
    checkedAt: null,
    error: null,
  };
  #checkUpdatePromise = null;
  #reconcileAfter = 0;

  constructor({
    db = null,
  }) {
    if (!db) {
      throw new Error('Missing SQLite Model');
    }
    this.db = db;

    this.debug = debug(`App:${this.id}`);
    this.debug('Name:', this.name);

    this.sync().catch(err => this.debug(`Error Syncing: ${err.message}`));
    this.syncInterval = setInterval(() => {
      this.sync().catch(err => this.debug(`Error Syncing: ${err.message}`));
    }, SYNC_INTERVAL);
    this.updateTimeout = setTimeout(() => {
      this.checkImageUpdate().catch(err => this.debug(`Error Checking Image: ${err.message}`));
    }, UPDATE_INITIAL_DELAY + Math.random() * UPDATE_INITIAL_DELAY);
    this.updateInterval = setInterval(() => {
      this.checkImageUpdate().catch(err => this.debug(`Error Checking Image: ${err.message}`));
    }, UPDATE_INTERVAL);
  }

  async sync() {
    if (this.#syncing || this.#changingContainer) return;
    this.#syncing = true;
    let reconcile = null;

    try {
      this.#containerMetadata = await Docker.findContainerByLabel({
        label: 'containarr.app.id',
        value: this.id,
      });

      if (!this.#containerMetadata) {
        this.#containerInstance = null;
      }

      // if (!this.#containerMetadata) {
      //   this.debug('Container does not exist, creating...');
      //   this.#containerMetadata = await this.createContainer();
      // }

      if (this.#containerMetadata && (!this.#containerInstance || this.#containerInstance.id !== this.#containerMetadata.Id)) {
        this.#containerInstance = await Docker.getContainerInstance(this.#containerMetadata?.Id);
      }

      if (
        this.#containerMetadata
        && this.#containerInstance
        && ['dead', 'exited', 'restarting'].includes(this.state?.toLowerCase())
      ) {
        try {
          const metadata = await this.#containerInstance.inspect();
          const exitCode = metadata.State?.ExitCode;
          const finishedAt = metadata.State?.FinishedAt;

          if (
            Number.isInteger(exitCode)
            && exitCode !== 0
            && finishedAt
            && !finishedAt.startsWith('0001-')
            && (
              this.containerError?.containerId !== metadata.Id
              || this.containerError?.finishedAt !== finishedAt
              || this.containerError?.exitCode !== exitCode
            )
          ) {
            this.db.containerError = {
              containerId: metadata.Id,
              exitCode,
              finishedAt,
              logs: await Docker.getContainerLogs({
                containerId: metadata.Id,
                tail: 200,
              }).catch(error => `Unable to retrieve container logs: ${error.message}`),
            };
            await this.db.save();
          }
        } catch (error) {
          if (error.statusCode !== 404) throw error;
        }
      }

      if (
        this.disabled
        && this.#containerMetadata
      ) {
        reconcile = 'disable';
      } else if (
        !this.disabled
        && (
          !this.#containerMetadata
          || ['created', 'dead', 'exited', 'paused'].includes(this.state?.toLowerCase())
        )
      ) {
        reconcile = 'enable';
      }
    } finally {
      this.#syncing = false;
    }

    if (reconcile && Date.now() >= this.#reconcileAfter) {
      try {
        if (reconcile === 'disable') {
          await this.stopContainer();
        } else {
          await this.startContainer();
        }
        this.#reconcileAfter = 0;
      } catch (error) {
        this.#reconcileAfter = Date.now() + 10_000;
        throw error;
      }
    }
  }

  async createContainer() {
    // TODO: Move this elsewhere?
    await Docker.pullImage(this.db.dockerImage);
    await this.removeContainer({ force: true });

    this.#containerInstance = await Docker.createContainer({
      name: this.subdomain,
      labels: {
        'containarr.app.id': this.id,
      },
      image: this.db.dockerImage,
      command: this.db.dockerCommand,
      entrypoint: this.db.dockerEntrypoint,
      workingDirectory: this.db.dockerWorkingDirectory,
      networkMode: this.dockerNetworkMode,
      networks: this.db.dockerNetworks ?? [],
      volumes: this.db.dockerVolumes,
      devices: this.db.dockerDevices,
      ports: this.db.dockerPorts,
      environment: this.db.dockerEnvironment,
      user: this.db.dockerUser,
      userId: this.db.dockerUserId,
      groupId: this.db.dockerGroupId,
      privileged: this.db.dockerPrivileged,
      capabilities: this.db.dockerCapabilities,
    });
    await this.sync();
  }

  async removeContainer({ force = false } = {}) {
    const containers = await Docker.getContainers();
    const candidates = new Map();

    for (const container of containers) {
      const managed = container.Labels?.['containarr.app.id'] === this.id;
      const nameConflict = container.Names?.includes(`/${this.subdomain}`);
      if (managed || nameConflict) {
        candidates.set(container.Id, {
          container: await Docker.getContainerInstance(container.Id),
          managed,
        });
      }
    }

    if (this.#containerInstance?.id && !candidates.has(this.#containerInstance.id)) {
      candidates.set(this.#containerInstance.id, {
        container: this.#containerInstance,
        managed: true,
      });
    }

    for (const [containerId, candidate] of candidates) {
      if (candidate.managed) {
        try {
          const metadata = await candidate.container.inspect();
          const exitCode = metadata.State?.ExitCode;
          const finishedAt = metadata.State?.FinishedAt;

          if (
            Number.isInteger(exitCode)
            && exitCode !== 0
            && !metadata.State?.Running
            && finishedAt
            && !finishedAt.startsWith('0001-')
            && (
              this.containerError?.containerId !== metadata.Id
              || this.containerError?.finishedAt !== finishedAt
              || this.containerError?.exitCode !== exitCode
            )
          ) {
            this.db.containerError = {
              containerId: metadata.Id,
              exitCode,
              finishedAt,
              logs: await Docker.getContainerLogs({
                containerId,
                tail: 200,
              }).catch(error => `Unable to retrieve container logs: ${error.message}`),
            };
            await this.db.save();
          }
        } catch (error) {
          if (error.statusCode !== 404) throw error;
        }
      }

      this.debug(`Removing container ${containerId}${candidate.managed ? '' : ' with conflicting name'}`);
      if (force) {
        await candidate.container.stop().catch(error => {
          if (![304, 404].includes(error.statusCode)) {
            this.debug(`Error Stopping Container ${containerId}: ${error.message}`);
          }
        });
      }
      await candidate.container.remove({ force }).catch(error => {
        if (error.statusCode !== 404) throw error;
      });
    }

    this.#containerMetadata = null;
    this.#containerInstance = null;
  }

  dispose() {
    clearInterval(this.syncInterval);
    clearInterval(this.updateInterval);
    clearTimeout(this.updateTimeout);
  }

  async setAutoUpdate(autoUpdate) {
    if (typeof autoUpdate !== 'boolean') {
      throw new Error('autoUpdate must be a boolean.');
    }

    this.db.autoUpdate = autoUpdate;
    await this.db.save();
    if (autoUpdate && this.#imageUpdate.status === 'available') {
      await this.checkImageUpdate({ applyUpdate: true });
    }
  }

  async setDisabled(disabled) {
    if (typeof disabled !== 'boolean') {
      throw new Error('disabled must be a boolean.');
    }

    this.db.disabled = disabled;
    await this.db.save();
    this.#reconcileAfter = 0;
    if (disabled) {
      while (this.#syncing || this.#changingContainer) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await this.stopContainer();
    } else {
      await this.sync();
    }
  }

  async checkImageUpdate({ applyUpdate = this.autoUpdate } = {}) {
    this.#checkUpdatePromise = this.#checkUpdatePromise || Promise.resolve().then(async () => {
      this.#imageUpdate = {
        status: 'checking',
        checkedAt: this.#imageUpdate.checkedAt,
        error: null,
      };

      try {
        await Docker.pullImage(this.db.dockerImage);
        const image = await Docker.getImageMetadata(this.db.dockerImage);
        await this.sync();
        const updateAvailable = Boolean(
          this.#containerMetadata?.ImageID
          && image.Id
          && this.#containerMetadata.ImageID !== image.Id
        );

        if (updateAvailable && applyUpdate) {
          this.#imageUpdate.status = 'updating';
          const running = this.state?.toLowerCase() === 'running';

          if (running) {
            await this.recreateContainer();
          } else if (this.#containerInstance) {
            const previousImageId = this.#containerMetadata?.ImageID ?? null;
            await this.removeContainer({ force: true });
            await this.createContainer();
            await Docker.deleteImageIfUnused({ imageId: previousImageId }).catch(error => {
              this.debug(`Error Cleaning Up Previous Image: ${error.message}`);
            });
          }
        }

        this.#imageUpdate = {
          status: updateAvailable && !applyUpdate ? 'available' : 'up_to_date',
          checkedAt: new Date().toISOString(),
          error: null,
        };
      } catch (error) {
        this.#imageUpdate = {
          status: 'error',
          checkedAt: new Date().toISOString(),
          error: error.message,
        };
        throw error;
      }
    }).finally(() => {
      this.#checkUpdatePromise = null;
    });

    return this.#checkUpdatePromise;
  }

  async startContainer() {
    if (this.#changingContainer) {
      throw new Error('The app container is already changing.');
    }
    this.#changingContainer = true;
    let replacementCreated = false;

    try {
      await this.createContainer();
      replacementCreated = true;
      if (this.containerError) {
        this.db.containerError = null;
        await this.db.save();
      }
      await this.#containerInstance.start();
    } catch (error) {
      if (replacementCreated) {
        await this.removeContainer({ force: true }).catch(removeError => {
          this.debug(`Error Cleaning Up Container: ${removeError.message}`);
        });
      }
      throw error;
    } finally {
      this.#changingContainer = false;
    }

    await this.sync();
  }

  async stopContainer() {
    if (this.#changingContainer) {
      throw new Error('The app container is already changing.');
    }
    this.#changingContainer = true;

    try {
      await this.removeContainer({ force: true });
    } finally {
      this.#changingContainer = false;
    }

    await this.sync();
  }

  async recreateContainer() {
    const previousImageIds = new Set(
      (await Docker.getContainers())
        .filter(container => container.Labels?.['containarr.app.id'] === this.id)
        .map(container => container.ImageID)
        .filter(Boolean),
    );
    await this.startContainer();
    for (const imageId of previousImageIds) {
      await Docker.deleteImageIfUnused({ imageId }).catch(error => {
        this.debug(`Error Cleaning Up Previous Image: ${error.message}`);
      });
    }
  }

  toJSON() {
    const ip = this.dockerNetworkMode === 'host'
      ? '127.0.0.1'
      : this.ip;

    return {
      id: this.id,
      name: this.name,
      subdomain: this.subdomain,
      state: this.state,
      port: this.port,
      url: ip && this.port ? `http://${ip}:${this.port}` : null,
      registryId: this.registryId,
      registryVersion: this.registryVersion,
      hasLogo: this.hasLogo,
      tls: this.tls,
      containerId: this.containerId,
      containerError: this.containerError,
      dockerImage: this.db.dockerImage,
      autoUpdate: this.autoUpdate,
      disabled: this.disabled,
      policyId: this.policyId,
      imageUpdate: this.#imageUpdate,
      dockerNetworkMode: this.dockerNetworkMode,
      dockerVolumes: Array.isArray(this.db.dockerVolumes)
        ? this.db.dockerVolumes
        : Object.values(this.db.dockerVolumes ?? {}),
      dockerDevices: Array.isArray(this.db.dockerDevices)
        ? this.db.dockerDevices
        : Object.values(this.db.dockerDevices ?? {}),
      dockerPorts: this.db.dockerPorts,
      dockerEnvironment: this.db.dockerEnvironment ?? {},
      dockerUserId: this.db.dockerUserId ?? null,
      dockerGroupId: this.db.dockerGroupId ?? null,
      dockerPrivileged: this.db.dockerPrivileged,
      dockerCapabilities: this.db.dockerCapabilities ?? [],
    };
  }

}

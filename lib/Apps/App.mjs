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
    if (this.dockerNetworkMode === 'host') return 'host.docker.internal';
    return this.#containerMetadata?.NetworkSettings?.Networks?.containarr?.IPAddress || null;
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

  get autoUpdate() {
    return this.db.autoUpdate ?? false;
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

  #syncing = false;
  #containerInstance = null;
  #containerMetadata = null;
  #imageUpdate = {
    status: 'not_checked',
    checkedAt: null,
    error: null,
  };
  #checkUpdatePromise = null;

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
    if (this.#syncing) return;
    this.#syncing = true;

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
    } finally {
      this.#syncing = false;
    }
  }

  async createContainer() {
    if (this.#containerInstance) {
      throw new Error(`Container already exists in state: ${this.state}`);
    }

    // TODO: Move this elsewhere?
    await Docker.pullImage(this.db.dockerImage);

    this.#containerInstance = await Docker.createContainer({
      name: this.subdomain,
      labels: {
        'containarr.app.id': this.id,
      },
      image: this.db.dockerImage,
      networkMode: this.dockerNetworkMode,
      volumes: this.db.dockerVolumes,
      devices: this.db.dockerDevices,
      ports: this.db.dockerPorts,
      environment: this.db.dockerEnvironment,
      privileged: this.db.dockerPrivileged,
      capabilities: this.db.dockerCapabilities,
    });
    await this.sync();
  }

  async removeContainer({ force = false } = {}) {
    if (force && !this.#containerInstance) {
      this.#containerMetadata = await Docker.findContainerByLabel({
        label: 'containarr.app.id',
        value: this.id,
      });
      if (this.#containerMetadata) {
        this.#containerInstance = await Docker.getContainerInstance(this.#containerMetadata.Id);
      }
    }

    if (this.#containerInstance) {
      await this.#containerInstance.remove({ force });
      this.#containerMetadata = null;
      this.#containerInstance = null;
    }
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
            await this.removeContainer({ force: true });
            await this.createContainer();
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
    if (!this.#containerInstance) {
      await this.createContainer();
    }

    await this.#containerInstance.start();
    await this.sync();
  }

  async stopContainer() {
    if (!this.#containerInstance) return;
    await this.#containerInstance.stop();
    await this.sync();
  }

  async recreateContainer() {
    await this.stopContainer().catch(err => this.debug(`Error Stopping Container: ${err.message}`));
    await this.removeContainer().catch(err => this.debug(`Error Removing Container: ${err.message}`));
    await this.createContainer();
    await this.startContainer();
  }

  async restartContainer() {
    if (!this.#containerInstance) {
      return this.startContainer();
    }

    await this.#containerInstance.restart();
    await this.sync();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      subdomain: this.subdomain,
      state: this.state,
      port: this.port,
      url: this.url,
      registryId: this.registryId,
      registryVersion: this.registryVersion,
      tls: this.tls,
      containerId: this.containerId,
      dockerImage: this.db.dockerImage,
      autoUpdate: this.autoUpdate,
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
      dockerPrivileged: this.db.dockerPrivileged,
      dockerCapabilities: this.db.dockerCapabilities ?? [],
    };
  }

}

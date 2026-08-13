import debug from 'debug';

import Docker from '../../services/Docker.mjs';

const SYNC_INTERVAL = 1000; // 1s

export default class App {

  static STATES = {
    UNKNOWN: 'unknown',
    CREATING: 'creating',
    STOPPED: 'stopped',
    STARTING: 'starting',
    RUNNING: 'running',
    STOPPING: 'stopping',
  };

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
    return this.#containerMetadata?.NetworkSettings?.Networks?.containarr?.IPAddress || null;
  }

  get port() {
    return this.db.port ?? null;
  }

  get url() {
    if (this.db.url) return this.db.url;
    if (this.ip && this.port) return `http://${this.ip}:${this.port}`;
    return null;
  }

  get registryId() {
    return this.db.registryId ?? null;
  }

  get registryVersion() {
    return this.db.registryVersion ?? null;
  }

  get tls() {
    return this.db.tls ?? null;
  }

  get containerId() {
    return this.#containerMetadata?.Id || null;
  }

  get containerState() {
    return this.#containerMetadata?.State || null;
  }

  #syncing = false;
  #state = App.STATES.UNKNOWN;
  #containerInstance = null;
  #containerMetadata = null;

  get state() {
    return this.#state;
  }

  set state(state) {
    if (state === this.#state) return;

    this.debug('State:', state);
    this.#state = state;
  }

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
  }

  async sync() {
    if (this.#syncing) return;
    this.#syncing = true;

    try {
      let container;
      this.#containerMetadata = await Docker.findContainerByLabel({
        label: 'containarr.app.id',
        value: this.id,
      });

      // if (!this.#containerMetadata) {
      //   this.debug('Container does not exist, creating...');
      //   this.#containerMetadata = await this.createContainer();
      // }

      if (this.#containerMetadata && (!this.#containerInstance || this.#containerInstance.id !== this.#containerMetadata?.Id)) {
        this.#containerInstance = await Docker.getContainerInstance(this.#containerMetadata?.Id);
      }
    } finally {
      this.#syncing = false;
    }
  }

  async createContainer() {
    if (![
      App.STATES.UNKNOWN,
    ].includes(this.state)) {
      throw new Error(`Cannot create app in state: ${this.state}`);
    }

    this.state = App.STATES.CREATING;

    // TODO: Move this elsewhere?
    await Docker.pullImage(this.db.dockerImage);

    try {
      this.#containerInstance = await Docker.createContainer({
        name: this.subdomain,
        labels: {
          'containarr.app.id': this.id,
        },
        image: this.db.dockerImage,
        volumes: this.db.dockerVolumes,
        ports: this.db.dockerPorts,
        environment: this.db.dockerEnvironment,
        privileged: this.db.dockerPrivileged,
        capabilities: this.db.dockerCapabilities,
      });
    } catch (err) {
      this.state = App.STATES.UNKNOWN;
      throw err;
    }

    this.state = App.STATES.STOPPED;
  }

  async removeContainer({ force = false } = {}) {
    if (!force && ![
      App.STATES.UNKNOWN,
      App.STATES.STOPPED,
    ].includes(this.state)) {
      throw new Error(`Cannot remove app in state: ${this.state}`);
    }

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

    this.state = App.STATES.UNKNOWN;
  }

  dispose() {
    clearInterval(this.syncInterval);
  }

  async startContainer() {
    if (![
      App.STATES.UNKNOWN,
      App.STATES.STOPPED,
    ].includes(this.state)) {
      throw new Error(`Cannot start app in state: ${this.state}`);
    }

    if (!this.#containerInstance) {
      await this.createContainer();
    }

    this.state = App.STATES.STARTING;
    await this.#containerInstance.start();
    this.state = App.STATES.RUNNING;
  }

  async stopContainer() {
    if (![
      App.STATES.UNKNOWN,
      App.STATES.RUNNING,
    ].includes(this.state)) {
      throw new Error(`Cannot stop app in state: ${this.state}`);
    }

    this.state = App.STATES.STOPPING;
    await this.#containerInstance.stop();
    this.state = App.STATES.STOPPED;
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

    this.state = App.STATES.STARTING;
    await this.#containerInstance.restart();
    this.state = App.STATES.RUNNING;
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
      containerState: this.containerState,
      dockerImage: this.db.dockerImage,
      dockerVolumes: Array.isArray(this.db.dockerVolumes)
        ? this.db.dockerVolumes
        : Object.values(this.db.dockerVolumes ?? {}),
      dockerPorts: this.db.dockerPorts,
      dockerEnvironment: this.db.dockerEnvironment ?? {},
      dockerPrivileged: this.db.dockerPrivileged,
      dockerCapabilities: this.db.dockerCapabilities ?? [],
    };
  }

}

import debug from 'debug';

import Docker from '../../services/Docker.mjs';

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
    return this.#containerMetadata?.NetworkSettings?.Networks?.bridge?.IPAddress || null;
  }

  get port() {
    return this.db.port ?? null;
  }

  get url() {
    if (this.db.url) return this.db.url;
    if (this.ip && this.port) return `http://${this.ip}:${this.port}`;
    return null;
  }

  #state = App.STATES.UNKNOWN;
  #containerInstance = null;
  #containerMetadata = null;

  get state() {
    return this.#state;
  }

  set state(state) {
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

    Promise.resolve().then(async () => {
      let container = await Docker.findContainerByLabel({
        label: 'containarr.app.id',
        value: this.id,
      });

      // The container does not yet exist, create it.
      if (container === null) {
        this.debug('Container does not exist, creating...');
        container = await this.createContainer();
      }

      this.#containerMetadata = container;
      this.#containerInstance = await Docker.getContainerInstance(container.Id);

      // this.debug('Container Metadata:', this.#containerMetadata);
      // this.debug('Container Instance:', this.#containerInstance);

      // Check container state
      this.debug(`Container State: ${this.#containerMetadata.State}`);
      switch (this.#containerMetadata.State) {
        case 'running': {
          this.state = App.STATES.RUNNING;
          break;
        }
        case 'exited':
        case 'created': {
          this.state = App.STATES.STOPPED;
          break;
        }
        default: {
          this.debug('Unknown container state:', this.#containerMetadata.State);
          this.state = App.STATES.UNKNOWN;
        }
      }
    }).catch(err => {
      this.debug(err);
    });
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

    const container = await Docker.createContainer({
      name: this.name,
      labels: {
        'containarr.app.id': this.id,
      },
      image: this.db.dockerImage,
      volumes: this.db.dockerVolumes,
      ports: this.db.dockerPorts,
      environment: this.db.dockerEnvironment,
    });

    this.state = App.STATES.STOPPED;

    return {
      metadata: container,
      instance: Docker.getContainerInstance(container.Id),
    };
  }

  async startContainer() {
    if (![
      App.STATES.STOPPED,
    ].includes(this.state)) {
      throw new Error(`Cannot start app in state: ${this.state}`);
    }

    this.state = App.STATES.STARTING;
    await this.#containerInstance.start();
    this.state = App.STATES.RUNNING;

  }

  async stopContainer() {
    if (![
      App.STATES.RUNNING,
    ].includes(this.state)) {
      throw new Error(`Cannot stop app in state: ${this.state}`);
    }

    this.state = App.STATES.STOPPING;
    await this.#containerInstance.stop();
    this.state = App.STATES.STOPPED;
  }

}
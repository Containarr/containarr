import debug from 'debug';
import dockerode from 'dockerode';

import {
  DOCKER_SOCK,
} from '../config.mjs';

export default class Docker {

  debug = debug('Docker');

  constructor() {
    this.dockerode = Promise.resolve().then(async () => {
      const docker = new dockerode({
        socketPath: DOCKER_SOCK,
      });

      await docker.ping();
      return docker;
    });

    this.dockerode
      .then(() => this.debug('Ready'))
      .catch(err => {
        this.debug(err);
        process.exit(1);
      });

    this.dockerode.then(async () => {
      const containers = await this.getContainers();
      this.debug(`Found ${containers.length} containers`);
    });
  }

  /*
   * Images
   */
  async getImages() {
    const docker = await this.dockerode;
    return docker.listImages();
  }

  async pullImage(image) {
    const docker = await this.dockerode;
    return new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) {
          return reject(err);
        }

        docker.modem.followProgress(stream, (err, output) => {
          if (err) {
            return reject(err);
          }
          resolve(output);
        });
      });
    });
  }

  /*
   * Containers
   */
  async getContainers() {
    const docker = await this.dockerode;
    return docker.listContainers({
      all: true,
    });
  }

  async findContainerByLabel({ label, value }) {
    const containers = await this.getContainers();
    const container = containers.find(container => container.Labels && container.Labels[label] === value);
    if (!container) return null;

    const docker = await this.dockerode;
    return container;
  }

  async getContainerInstance(containerId) {
    const docker = await this.dockerode;
    return docker.getContainer(containerId);
  }

  async createContainer({
    name = null,
    labels = {},
    image = null,
    volumes = [],
    ports = [],
    environment = {},
  }) {
    const docker = await this.dockerode;
    const container = await docker.createContainer({
      name,
      Labels: labels,
      Image: image,
      HostConfig: {
        Binds: volumes,
        PortBindings: ports.reduce((acc, port) => {
          acc[`${port.container}/tcp`] = [{ HostPort: `${port.host}` }];
          return acc;
        }, {}),
      },
      Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    });

    return container;
  }
}
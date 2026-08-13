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

  async getContainerLogs({
    containerId,
    tail = 200,
  }) {
    const container = await this.getContainerInstance(containerId);
    const [metadata, output] = await Promise.all([
      container.inspect(),
      container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail,
      }),
    ]);
    const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output);

    if (metadata.Config.Tty) return buffer.toString('utf8');
    return decodeDockerLogStream(buffer);
  }

  async createContainer({
    name = null,
    labels = {},
    image = null,
    networkMode = 'bridge',
    volumes = [],
    ports = [],
    environment = {},
    privileged = false,
    capabilities = [],
  }) {
    const docker = await this.dockerode;
    if (!['bridge', 'host'].includes(networkMode)) {
      throw new Error(`Invalid network mode: ${networkMode}`);
    }

    const portBindings = ports.reduce((acc, port) => {
      acc[`${port.container}/${port.protocol}`] = [{ HostPort: `${port.host}` }];
      return acc;
    }, {});
    const containerConfig = {
      name,
      Labels: labels,
      Image: image,
      HostConfig: {
        Binds: volumes,
        NetworkMode: networkMode === 'host' ? 'host' : undefined,
        PortBindings: networkMode === 'host' ? {} : portBindings,
      },
      Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
      Privileged: privileged,
      CapAdd: capabilities,
    };

    if (networkMode !== 'host') {
      containerConfig.NetworkingConfig = {
        EndpointsConfig: {
          containarr: {},
        },
      };
    }

    const container = await docker.createContainer(containerConfig);

    return container;
  }

  async deleteContainer({
    containerId,
  }) {
    const docker = await this.dockerode;
    const container = docker.getContainer(containerId);
    await container.remove({
      force: true,
    });
  }
}

function decodeDockerLogStream(buffer) {
  let offset = 0;
  let output = '';

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) break;

    output += buffer.subarray(start, end).toString('utf8');
    offset = end;
  }

  return output || buffer.toString('utf8');
}

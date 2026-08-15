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

  async getImageMetadata(image) {
    const docker = await this.dockerode;
    return docker.getImage(image).inspect();
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

  async getContainerStats({
    containerId,
  }) {
    const container = await this.getContainerInstance(containerId);
    const metadata = await container.inspect();

    if (!metadata.State.Running) {
      return {
        id: metadata.Id,
        read: new Date().toISOString(),
        cpuPercent: 0,
        memoryUsage: 0,
        memoryLimit: 0,
        blockReadBytes: 0,
        blockWriteBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
      };
    }

    const stats = await container.stats({ stream: false });
    const cpuUsage = stats.cpu_stats?.cpu_usage ?? {};
    const previousCpuUsage = stats.precpu_stats?.cpu_usage ?? {};
    const cpuDelta = (cpuUsage.total_usage ?? 0) - (previousCpuUsage.total_usage ?? 0);
    const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0)
      - (stats.precpu_stats?.system_cpu_usage ?? 0);
    const onlineCpus = stats.cpu_stats?.online_cpus
      ?? cpuUsage.percpu_usage?.length
      ?? 1;
    const cpuPercent = cpuDelta > 0 && systemDelta > 0
      ? (cpuDelta / systemDelta) * onlineCpus * 100
      : 0;

    const memoryStats = stats.memory_stats ?? {};
    const cache = memoryStats.stats?.inactive_file
      ?? memoryStats.stats?.total_inactive_file
      ?? memoryStats.stats?.cache
      ?? 0;
    const memoryUsage = Math.max(0, (memoryStats.usage ?? 0) - cache);

    let blockReadBytes = 0;
    let blockWriteBytes = 0;
    for (const entry of stats.blkio_stats?.io_service_bytes_recursive ?? []) {
      const operation = entry.op?.toLowerCase();
      if (operation === 'read') blockReadBytes += entry.value ?? 0;
      if (operation === 'write') blockWriteBytes += entry.value ?? 0;
    }

    let networkRxBytes = 0;
    let networkTxBytes = 0;
    for (const network of Object.values(stats.networks ?? {})) {
      networkRxBytes += network.rx_bytes ?? 0;
      networkTxBytes += network.tx_bytes ?? 0;
    }

    return {
      id: metadata.Id,
      read: stats.read ?? new Date().toISOString(),
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
      memoryUsage: Number.isFinite(memoryUsage) ? memoryUsage : 0,
      memoryLimit: Number.isFinite(memoryStats.limit) ? memoryStats.limit : 0,
      blockReadBytes: Number.isFinite(blockReadBytes) ? blockReadBytes : 0,
      blockWriteBytes: Number.isFinite(blockWriteBytes) ? blockWriteBytes : 0,
      networkRxBytes: Number.isFinite(networkRxBytes) ? networkRxBytes : 0,
      networkTxBytes: Number.isFinite(networkTxBytes) ? networkTxBytes : 0,
    };
  }

  async createContainerShell({
    containerId,
    onClose,
    onData,
    onError,
  }) {
    const container = await this.getContainerInstance(containerId);
    const metadata = await container.inspect();
    if (!metadata.State.Running) {
      throw new Error('The container must be running to open a shell.');
    }

    const exec = await container.exec({
      AttachStderr: true,
      AttachStdin: true,
      AttachStdout: true,
      Cmd: ['/bin/sh'],
      Env: ['TERM=xterm-256color'],
      Tty: true,
    });
    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    stream.on('data', data => onData(data.toString('utf8')));
    stream.on('end', onClose);
    stream.on('close', onClose);
    stream.on('error', onError);

    return {
      close() {
        stream.end();
        stream.destroy();
      },
      resize({ columns, rows }) {
        return exec.resize({
          h: rows,
          w: columns,
        });
      },
      write(data) {
        stream.write(data);
      },
    };
  }

  async createContainer({
    name = null,
    labels = {},
    image = null,
    networkMode = 'bridge',
    volumes = [],
    devices = [],
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
        Devices: devices.map(device => {
          const [pathOnHost, pathInContainer = pathOnHost] = device.split(':');
          return {
            PathOnHost: pathOnHost,
            PathInContainer: pathInContainer,
            CgroupPermissions: 'rwm',
          };
        }),
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

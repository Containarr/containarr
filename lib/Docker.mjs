import debug from 'debug';
import dockerode from 'dockerode';
import os from 'node:os';

import {
  CONTAINARR_IMAGE,
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

  async getDockerHostGateway() {
    const docker = await this.dockerode;
    const network = await docker.getNetwork('containarr').inspect();
    const gateway = network.IPAM?.Config?.find(config => config.Gateway)?.Gateway;
    if (!gateway) throw new Error('The containarr network has no gateway.');
    return gateway;
  }

  async getHostIpAddresses() {
    if (!process.env.HOSTNAME) {
      return Object.values(os.networkInterfaces())
        .flat()
        .filter(address => address?.family === 'IPv4' && !address.internal)
        .map(address => address.address);
    }

    const docker = await this.dockerode;
    let helperImage = CONTAINARR_IMAGE;
    try {
      const metadata = await docker.getContainer(process.env.HOSTNAME).inspect();
      helperImage = metadata.Config.Image;
    } catch {
      // Fall back to the configured Containarr image.
    }

    const container = await docker.createContainer({
      Image: helperImage,
      Entrypoint: ['/usr/local/bin/node'],
      Cmd: ['/app/lib/Docker/ListHostIpAddresses.mjs'],
      Tty: false,
      HostConfig: {
        NetworkMode: 'host',
      },
    });

    try {
      await container.start();
      const result = await container.wait();
      const output = decodeDockerLogStream(Buffer.from(
        await container.logs({ stdout: true, stderr: true }),
      ));
      if (result.StatusCode !== 0) {
        throw new Error(output.trim() || 'Unable to inspect host IP addresses.');
      }
      const addresses = JSON.parse(output);
      if (!Array.isArray(addresses) || addresses.some(address => typeof address !== 'string')) {
        throw new Error('Host IP inspection returned an invalid response.');
      }
      return addresses;
    } finally {
      await container.remove({ force: true }).catch(() => {});
    }
  }

  /*
   * Images
   */
  async getImages() {
    const docker = await this.dockerode;
    return docker.listImages();
  }

  async cleanupImages() {
    const docker = await this.dockerode;
    return docker.pruneImages({
      filters: {
        dangling: ['false'],
      },
    });
  }

  async deleteImage({
    imageId,
  }) {
    const docker = await this.dockerode;
    return docker.getImage(imageId).remove();
  }

  async deleteImageIfUnused({
    imageId,
  }) {
    if (!imageId) return false;

    const containers = await this.getContainers();
    if (containers.some(container => container.ImageID === imageId)) return false;

    const docker = await this.dockerode;
    try {
      await docker.getImage(imageId).remove({ force: true });
      return true;
    } catch (error) {
      if ([404, 409].includes(error.statusCode)) return false;
      throw error;
    }
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

  async getPathSuggestions({ source, requestedPath, image = null }) {
    if (!['host', 'device', 'image'].includes(source)) {
      throw new Error(`Invalid path source: ${source}`);
    }
    if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/')) {
      throw new Error('Path must be absolute.');
    }
    if (source === 'image' && !image) {
      throw new Error('Missing Docker image.');
    }

    const docker = await this.dockerode;
    let container;

    try {
      if (source === 'image') {
        await this.getImageMetadata(image).catch(() => this.pullImage(image));
        const separator = requestedPath.endsWith('/')
          ? requestedPath.length - 1
          : requestedPath.lastIndexOf('/');
        const directory = requestedPath.endsWith('/')
          ? requestedPath.replace(/\/+$/, '') || '/'
          : requestedPath.slice(0, separator) || '/';
        const prefix = requestedPath.endsWith('/')
          ? ''
          : requestedPath.slice(separator + 1);

        container = await docker.createContainer({
          Image: image,
          Entrypoint: ['ls'],
          Cmd: ['-1Ap', directory],
          Tty: false,
          HostConfig: {
            NetworkMode: 'none',
          },
        });
        await container.start();
        let waitTimeout;
        const result = await Promise.race([
          container.wait(),
          new Promise((resolve, reject) => {
            waitTimeout = setTimeout(() => reject(new Error(`Timed out inspecting ${image}.`)), 5000);
          }),
        ]).finally(() => clearTimeout(waitTimeout));
        const output = decodeDockerLogStream(Buffer.from(
          await container.logs({ stdout: true, stderr: true }),
        ));
        if (result.StatusCode !== 0) {
          throw new Error(output.trim() || `Unable to inspect ${image}.`);
        }

        return output
          .split('\n')
          .map(entry => entry.trim())
          .filter(entry => entry && !['./', '../'].includes(entry))
          .filter(entry => entry.replace(/\/$/, '').toLowerCase().startsWith(prefix.toLowerCase()))
          .slice(0, 100)
          .map(entry => ({
            path: `${directory === '/' ? '' : directory}/${entry}`,
            directory: entry.endsWith('/'),
          }));
      }

      let helperImage = CONTAINARR_IMAGE;
      if (process.env.HOSTNAME) {
        try {
          const metadata = await docker.getContainer(process.env.HOSTNAME).inspect();
          helperImage = metadata.Config.Image;
        } catch {
          // Fall back to the configured Containarr image outside Docker.
        }
      }

      container = await docker.createContainer({
        Image: helperImage,
        Entrypoint: ['/usr/local/bin/node'],
        Cmd: [
          '/app/lib/Docker/ListPaths.mjs',
          requestedPath,
          source === 'device' ? '/dev' : '/',
        ],
        Tty: false,
        HostConfig: {
          Binds: [`${source === 'device' ? '/dev' : '/'}:/host:ro`],
          NetworkMode: 'none',
        },
      });
      await container.start();
      let waitTimeout;
      const result = await Promise.race([
        container.wait(),
        new Promise((resolve, reject) => {
          waitTimeout = setTimeout(() => reject(new Error('Timed out inspecting host paths.')), 5000);
        }),
      ]).finally(() => clearTimeout(waitTimeout));
      const output = decodeDockerLogStream(Buffer.from(
        await container.logs({ stdout: true, stderr: true }),
      ));
      if (result.StatusCode !== 0) {
        throw new Error(output.trim() || 'Unable to inspect host paths.');
      }
      return JSON.parse(output);
    } finally {
      if (container) {
        await container.remove({ force: true }).catch(() => {});
      }
    }
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

  async cleanupContainers() {
    const docker = await this.dockerode;
    return docker.pruneContainers();
  }

  /*
   * Volumes
   */
  async getVolumes() {
    const docker = await this.dockerode;
    const [result, diskUsage] = await Promise.all([
      docker.listVolumes(),
      docker.df(),
    ]);
    const usageByName = new Map(
      (diskUsage.Volumes ?? []).map(volume => [volume.Name, volume.UsageData]),
    );
    return {
      ...result,
      Volumes: (result.Volumes ?? []).map(volume => ({
        ...volume,
        UsageData: usageByName.get(volume.Name) ?? volume.UsageData,
      })),
    };
  }

  async cleanupVolumes() {
    const docker = await this.dockerode;
    return docker.pruneVolumes({
      filters: {
        all: ['true'],
      },
    });
  }

  async deleteVolume({
    volumeName,
  }) {
    const docker = await this.dockerode;
    return docker.getVolume(volumeName).remove();
  }

  /*
   * Networks
   */
  async getNetworks() {
    const docker = await this.dockerode;
    const networks = await docker.listNetworks();
    return Promise.all(networks.map(async network => {
      try {
        return await docker.getNetwork(network.Id).inspect();
      } catch {
        return network;
      }
    }));
  }

  async cleanupNetworks() {
    const docker = await this.dockerode;
    return docker.pruneNetworks();
  }

  async deleteNetwork({
    networkId,
  }) {
    const docker = await this.dockerode;
    const network = docker.getNetwork(networkId);
    const metadata = await network.inspect();
    if (Object.keys(metadata.Containers ?? {}).length > 0) {
      throw new Error(`Network ${metadata.Name} has active endpoints and cannot be deleted.`);
    }
    return network.remove();
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
    command = null,
    entrypoint = null,
    workingDirectory = null,
    networkMode = 'bridge',
    networks = [],
    volumes = [],
    devices = [],
    ports = [],
    environment = {},
    user = null,
    userId = null,
    groupId = null,
    privileged = false,
    capabilities = [],
  }) {
    const docker = await this.dockerode;
    if (!['bridge', 'host'].includes(networkMode)) {
      throw new Error(`Invalid network mode: ${networkMode}`);
    }

    const portBindings = ports.reduce((acc, port) => {
      const key = `${port.container}/${port.protocol}`;
      acc[key] = acc[key] ?? [];
      acc[key].push({
        HostIp: port.hostIp || '',
        HostPort: `${port.host}`,
      });
      return acc;
    }, {});
    const containerConfig = {
      name,
      Labels: labels,
      Image: image,
      Cmd: command,
      Entrypoint: entrypoint,
      WorkingDir: workingDirectory || undefined,
      HostConfig: {
        Binds: volumes,
        Devices: devices.map(device => {
          const [pathOnHost, pathInContainer = pathOnHost, cgroupPermissions = 'rwm'] = device.split(':');
          return {
            PathOnHost: pathOnHost,
            PathInContainer: pathInContainer,
            CgroupPermissions: cgroupPermissions,
          };
        }),
        NetworkMode: networkMode === 'host' ? 'host' : undefined,
        PortBindings: networkMode === 'host' ? {} : portBindings,
        RestartPolicy: {
          Name: 'unless-stopped',
          MaximumRetryCount: 0,
        },
        Privileged: privileged,
        CapAdd: capabilities,
      },
      Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
      User: userId === null
        ? user || undefined
        : groupId === null
          ? `${userId}`
          : `${userId}:${groupId}`,
    };

    if (networkMode !== 'host') {
      containerConfig.NetworkingConfig = {
        EndpointsConfig: {
          containarr: {},
        },
      };
    }

    const container = await docker.createContainer(containerConfig);

    try {
      if (networkMode !== 'host') {
        for (const network of networks) {
          if (!network?.name || network.name === 'containarr') continue;
          await docker.getNetwork(network.name).connect({
            Container: container.id,
            EndpointConfig: {
              Aliases: Array.isArray(network.aliases) ? network.aliases : [],
            },
          });
        }
      }
    } catch (error) {
      await container.remove({ force: true }).catch(() => {});
      throw error;
    }

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

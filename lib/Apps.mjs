import Docker from '../services/Docker.mjs';
import SQLite from '../services/SQLite.mjs';
import Firewall from '../services/Firewall.mjs';

import App from './Apps/App.mjs';

import {
  CONTAINARR_VERSION,
  APPS_REGISTRY_URL,
} from '../config.mjs';

export default class Apps {

  #apps = new Map();
  #ready;

  constructor() {
    this.#ready = Promise.resolve().then(async () => {
      // Initialize Apps
      const AppDatabase = await SQLite.getModelApp();
      const appIds = await AppDatabase.findAll({ attributes: ['id'] }).then(apps => apps.map(app => app.id));

      for (const appId of appIds) {
        const appDatabase = await AppDatabase.findOne({ where: { id: appId } });
        const appInstance = new App({
          db: appDatabase,
        });
        this.#apps.set(appDatabase.id, appInstance);
      }
    });

    this.#ready.catch(err => {
      console.error(err);
      process.exit(1);
    });
  }

  async getAppsRegistry() {
    const res = await fetch(APPS_REGISTRY_URL, {
      headers: {
        'User-Agent': `Containarr/v${CONTAINARR_VERSION}`,
      },
    });
    const appsRegistry = await res.json();

    if (!res.ok) {
      throw new Error(`[${res.status}] ${res.statusText}`);
    }

    return Object.fromEntries(Object.entries(appsRegistry).map(([registryId, app]) => [
      registryId,
      {
        ...app,
        logoUrl: `${APPS_REGISTRY_URL.replace(/\/$/, '')}/${registryId}.png`,
      },
    ]));
  }

  async createAppFromAppsRegistry({
    registryId,
    subdomain,
    tls,
    port = null,
    dockerEnvironment = null,
    dockerVolumes = null,
    dockerDevices = null,
    dockerPorts = null,
    dockerUserId,
    dockerGroupId,
    dockerPrivileged = null,
    dockerCapabilities = null,
    dockerNetworkMode = null,
    dockerNetworks = [],
    policyId = 'public',
  }) {
    const appsRegistry = await this.getAppsRegistry();
    const appRegistry = appsRegistry[registryId];
    if (!appRegistry) {
      throw new Error(`App Not Found in Registry: ${registryId}`);
    }
    const internalPort = port ?? appRegistry.port;
    if (!Number.isInteger(internalPort) || internalPort < 1 || internalPort > 65535) {
      throw Object.assign(new Error('Internal port must be between 1 and 65535.'), { statusCode: 400 });
    }

    const logo = await fetch(appRegistry.logoUrl, {
      headers: {
        'User-Agent': `Containarr/v${CONTAINARR_VERSION}`,
      },
    }).then(res => res.ok ? res.arrayBuffer() : null);

    return this.createApp({
      name: appRegistry.name,
      logo,
      subdomain,
      port: internalPort,
      tls,
      registryId,
      registryVersion: appRegistry.version,
      dockerImage: appRegistry.dockerImage,
      dockerVolumes: dockerVolumes ?? Object.values(appRegistry.dockerVolumes ?? {}),
      dockerDevices: dockerDevices ?? Object.values(appRegistry.dockerDevices ?? {}),
      dockerPorts: dockerPorts ?? appRegistry.dockerPorts,
      dockerEnvironment: dockerEnvironment ?? appRegistry.dockerEnvironment,
      dockerUserId: dockerUserId === undefined ? appRegistry.dockerUserId : dockerUserId,
      dockerGroupId: dockerGroupId === undefined ? appRegistry.dockerGroupId : dockerGroupId,
      dockerPrivileged: dockerPrivileged ?? appRegistry.dockerPrivileged,
      dockerCapabilities: dockerCapabilities ?? appRegistry.dockerCapabilities,
      dockerNetworkMode: dockerNetworkMode ?? appRegistry.dockerNetworkMode ?? 'bridge',
      dockerNetworks,
      policyId,
    });
  }

  async createApp({
    name = 'New App',
    logo = null,
    subdomain = null,
    port = null,
    tls = 'only_https',
    registryId = null,
    registryVersion = null,
    dockerImage = null,
    dockerNetworkMode = 'bridge',
    dockerVolumes = [],
    dockerDevices = [],
    dockerPorts = [],
    dockerEnvironment = {},
    dockerUserId = null,
    dockerGroupId = null,
    dockerPrivileged = false,
    dockerCapabilities = [],
    policyId = 'public',
    dockerCommand = null,
    dockerEntrypoint = null,
    dockerWorkingDirectory = null,
    dockerNetworks = [],
    dockerUser = null,
  }) {
    await this.#ready;
    await Firewall.getPolicy({ policyId });
    const AppDatabase = await SQLite.getModelApp();
    const ProxyDatabase = await SQLite.getModelProxy();
    if (subdomain && await ProxyDatabase.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by a proxy: ${subdomain}`);
    }
    const appDatabase = await AppDatabase.create({
      name,
      logo,
      subdomain,
      port,
      tls,
      registryId,
      registryVersion,
      dockerImage,
      dockerNetworkMode,
      dockerVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
      dockerCommand,
      dockerEntrypoint,
      dockerWorkingDirectory,
      dockerNetworks,
      dockerUser,
    });

    const appInstance = new App({
      db: appDatabase,
    });
    this.#apps.set(appDatabase.id, appInstance);

    return appInstance;
  }

  async importContainer({ containerId, settings = null, preview = false }) {
    await this.#ready;
    const container = await Docker.getContainerInstance(containerId);
    const metadata = await container.inspect();
    const currentContainer = await Docker.getCurrentContainerMetadata().catch(() => null);
    if (metadata.Id === currentContainer?.Id) {
      throw new Error('Containarr cannot import its own container.');
    }
    if (metadata.Config?.Labels?.['containarr.app.id']) {
      throw new Error('This container is already managed by an app.');
    }

    const originalName = metadata.Name.replace(/^\//, '');
    const AppDatabase = await SQLite.getModelApp();
    const ProxyDatabase = await SQLite.getModelProxy();
    const usedSubdomains = new Set([
      ...await AppDatabase.findAll({ attributes: ['subdomain'] }).then(apps => apps.map(app => app.subdomain)),
      ...await ProxyDatabase.findAll({ attributes: ['subdomain'] }).then(proxies => proxies.map(proxy => proxy.subdomain)),
    ]);
    const baseSubdomain = originalName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)
      .replace(/-+$/g, '') || `app-${metadata.Id.slice(0, 12)}`;
    let subdomain = baseSubdomain;
    let suffix = 2;
    while (usedSubdomains.has(subdomain)) {
      subdomain = `${baseSubdomain.slice(0, 63 - String(suffix).length - 1).replace(/-+$/g, '')}-${suffix}`;
      suffix += 1;
    }

    const environment = {};
    for (const variable of metadata.Config?.Env ?? []) {
      const separator = variable.indexOf('=');
      environment[separator === -1 ? variable : variable.slice(0, separator)] = separator === -1
        ? ''
        : variable.slice(separator + 1);
    }
    const volumes = (metadata.Mounts ?? [])
      .filter(mount => ['bind', 'volume'].includes(mount.Type))
      .map(mount => {
        const source = mount.Type === 'volume' ? mount.Name : mount.Source;
        return `${source}:${mount.Destination}${mount.RW ? '' : ':ro'}`;
      });
    const devices = (metadata.HostConfig?.Devices ?? []).map(device => [
      device.PathOnHost,
      device.PathInContainer,
      device.CgroupPermissions,
    ].filter(Boolean).join(':'));
    const ports = [];
    for (const [target, bindings] of Object.entries(metadata.HostConfig?.PortBindings ?? {})) {
      const [containerPort, protocol = 'tcp'] = target.split('/');
      const parsedContainerPort = Number(containerPort);
      if (
        !['tcp', 'udp'].includes(protocol)
        || !Number.isInteger(parsedContainerPort)
        || parsedContainerPort < 1
        || parsedContainerPort > 65535
      ) continue;
      for (const binding of bindings ?? []) {
        const hostPort = Number(binding.HostPort);
        if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) continue;
        ports.push({
          container: parsedContainerPort,
          host: hostPort,
          hostIp: binding.HostIp || '',
          protocol,
        });
      }
    }
    const exposedTcpPorts = Object.keys(metadata.Config?.ExposedPorts ?? {})
      .filter(port => port.endsWith('/tcp'))
      .map(port => Number(port.split('/')[0]))
      .filter(port => Number.isInteger(port) && port > 0 && port <= 65535);
    const userParts = /^([0-9]+)(?::([0-9]+))?$/.exec(metadata.Config?.User ?? '');
    const capabilities = (metadata.HostConfig?.CapAdd ?? []).map(capability => (
      capability.startsWith('CAP_') ? capability : `CAP_${capability}`
    ));
    const networks = Object.entries(metadata.NetworkSettings?.Networks ?? {})
      .filter(([name]) => !['bridge', 'host', 'none'].includes(name))
      .map(([name, network]) => ({
        name,
        aliases: (network.Aliases ?? []).filter(alias => alias !== metadata.Id && alias !== metadata.Id.slice(0, 12)),
      }));
    const networkMode = metadata.HostConfig?.NetworkMode === 'host' ? 'host' : 'bridge';

    const configuration = {
      name: originalName,
      subdomain,
      port: exposedTcpPorts[0] ?? null,
      tls: 'only_https',
      dockerImage: metadata.Config.Image,
      dockerNetworkMode: networkMode,
      dockerVolumes: volumes,
      dockerDevices: devices,
      dockerPorts: ports,
      dockerEnvironment: environment,
      dockerUserId: userParts ? Number(userParts[1]) : null,
      dockerGroupId: userParts?.[2] ? Number(userParts[2]) : null,
      dockerPrivileged: Boolean(metadata.HostConfig?.Privileged),
      dockerCapabilities: capabilities,
      dockerCommand: metadata.Config?.Cmd ?? null,
      dockerEntrypoint: metadata.Config?.Entrypoint ?? null,
      dockerWorkingDirectory: metadata.Config?.WorkingDir || null,
      dockerNetworks: networks,
      dockerUser: userParts ? null : metadata.Config?.User || null,
      policyId: 'public',
      ...(settings ? {
        name: settings.name,
        subdomain: settings.subdomain,
        port: settings.port,
        tls: settings.tls,
        dockerImage: settings.dockerImage,
        dockerNetworkMode: settings.dockerNetworkMode,
        dockerNetworks: settings.dockerNetworks ?? networks,
        dockerVolumes: settings.dockerVolumes,
        dockerDevices: settings.dockerDevices,
        dockerPorts: settings.dockerPorts,
        dockerEnvironment: settings.dockerEnvironment,
        dockerUserId: settings.dockerUserId,
        dockerGroupId: settings.dockerGroupId,
        dockerPrivileged: settings.dockerPrivileged,
        dockerCapabilities: settings.dockerCapabilities,
        policyId: settings.policyId,
      } : {}),
    };

    if (preview) return configuration;

    await Firewall.getPolicy({ policyId: configuration.policyId });
    if (
      configuration.subdomain
      && await ProxyDatabase.findOne({ where: { subdomain: configuration.subdomain } })
    ) {
      throw new Error(`Subdomain is already used by a proxy: ${configuration.subdomain}`);
    }
    const wasRunning = Boolean(metadata.State?.Running);
    const appDatabase = await AppDatabase.create({
      ...configuration,
      disabled: !wasRunning,
    });

    const appInstance = new App({
      db: appDatabase,
      sync: false,
    });
    this.#apps.set(appDatabase.id, appInstance);
    appInstance.importContainer({
      container,
      metadata,
      originalName,
      wasRunning,
    }).catch(error => {
      appInstance.debug(`Error Importing Container: ${error.message}`);
    });
    return appInstance;
  }

  async getApp({ appId }) {
    await this.#ready;
    const appInstance = this.#apps.get(appId);
    if (!appInstance) {
      throw new Error(`App Not Found: ${appId}`);
    }
    return appInstance;
  }

  async updateApp({
    appId,
    name,
    subdomain,
    port,
    tls,
    dockerImage,
    dockerNetworkMode,
    dockerNetworks,
    dockerVolumes,
    dockerDevices,
    dockerPorts,
    dockerEnvironment,
    dockerUserId,
    dockerGroupId,
    dockerPrivileged,
    dockerCapabilities,
    policyId,
  }) {
    const appInstance = await this.getApp({ appId });
    const imageChanged = dockerImage !== appInstance.db.dockerImage;
    const previousImageId = imageChanged
      ? await Docker.getImageMetadata(appInstance.db.dockerImage)
        .then(image => image.Id)
        .catch(() => null)
      : null;
    policyId = policyId ?? appInstance.policyId;
    await Firewall.getPolicy({ policyId });
    const ProxyDatabase = await SQLite.getModelProxy();
    if (subdomain && await ProxyDatabase.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by a proxy: ${subdomain}`);
    }
    appInstance.db.set({
      name,
      subdomain,
      port,
      tls,
      dockerImage,
      dockerNetworkMode,
      dockerNetworks: dockerNetworks ?? appInstance.db.dockerNetworks ?? [],
      dockerVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    });
    await appInstance.db.save();
    const currentImageId = imageChanged
      ? await Docker.getImageMetadata(dockerImage)
        .then(image => image.Id)
        .catch(() => null)
      : null;
    if (previousImageId && previousImageId !== currentImageId) {
      await Docker.deleteImageIfUnused({ imageId: previousImageId }).catch(error => {
        appInstance.debug(`Error Cleaning Up Previous Image: ${error.message}`);
      });
    }
    return appInstance;
  }

  async getAppLogo({ appId }) {
    const AppDatabase = await SQLite.getModelApp();
    const appDatabase = await AppDatabase.findOne({ where: { id: appId } });
    if (!appDatabase) {
      throw new Error(`App Not Found: ${appId}`);
    }

    return appDatabase.logo;
  }

  async getApps() {
    await this.#ready;
    return Object.fromEntries(this.#apps.entries());
  }

  async deleteApp({ appId }) {
    await this.#ready;
    const appInstance = this.#apps.get(appId);
    if (!appInstance) {
      throw new Error(`App Not Found: ${appId}`);
    }

    const containers = (await Docker.getContainers())
      .filter(container => container.Labels?.['containarr.app.id'] === appId);
    const imageIds = new Set(
      containers
        .map(container => container.ImageID)
        .filter(Boolean),
    );
    const volumeNames = new Set(
      containers.flatMap(container => (container.Mounts ?? [])
        .filter(mount => mount.Type === 'volume')
        .map(mount => mount.Name || mount.Source)
        .filter(Boolean)),
    );
    const configuredVolumes = Array.isArray(appInstance.db.dockerVolumes)
      ? appInstance.db.dockerVolumes
      : Object.values(appInstance.db.dockerVolumes ?? {});
    for (const volume of configuredVolumes) {
      if (typeof volume !== 'string') continue;
      const separator = volume.indexOf(':');
      if (separator < 1) continue;
      const source = volume.slice(0, separator);
      if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(source)) volumeNames.add(source);
    }
    const configuredImageId = await Docker.getImageMetadata(appInstance.db.dockerImage)
      .then(image => image.Id)
      .catch(() => null);
    if (configuredImageId) imageIds.add(configuredImageId);

    appInstance.dispose();
    await appInstance.removeContainer({ force: true });
    await appInstance.db.destroy();
    this.#apps.delete(appId);
    const EventAppState = await SQLite.getModel('EventAppState');
    await EventAppState.destroy({ where: { appId } });
    const Setting = await SQLite.getModelSetting();
    await Setting.destroy({ where: { key: `events.app-update.${appId}` } });

    for (const imageId of imageIds) {
      await Docker.deleteImageIfUnused({ imageId }).catch(error => {
        appInstance.debug(`Error Cleaning Up Deleted App Image: ${error.message}`);
      });
    }
    for (const volumeName of volumeNames) {
      await Docker.deleteVolumeIfUnused({ volumeName }).catch(error => {
        appInstance.debug(`Error Cleaning Up Deleted App Volume: ${error.message}`);
      });
    }
  }

}

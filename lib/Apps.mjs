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

  constructor() {
    Promise.resolve().then(async () => {
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
    }).catch(err => {
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

    return appsRegistry;
  }

  async createAppFromAppsRegistry({
    registryId,
    subdomain,
    tls,
    dockerEnvironment = null,
    dockerVolumes = null,
    dockerDevices = null,
    dockerPorts = null,
    dockerUserId,
    dockerGroupId,
    dockerPrivileged = null,
    dockerCapabilities = null,
    dockerNetworkMode = null,
    policyId = 'public',
  }) {
    const appsRegistry = await this.getAppsRegistry();
    const appRegistry = appsRegistry[registryId];
    if (!appRegistry) {
      throw new Error(`App Not Found in Registry: ${registryId}`);
    }

    const logo = await fetch(`${APPS_REGISTRY_URL}/${registryId}.png`, {
      headers: {
        'User-Agent': `Containarr/v${CONTAINARR_VERSION}`,
      },
    }).then(res => res.ok ? res.arrayBuffer() : null);

    return this.createApp({
      name: appRegistry.name,
      logo,
      subdomain,
      port: appRegistry.port,
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
  }) {
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
    });

    const appInstance = new App({
      db: appDatabase,
    });
    this.#apps.set(appDatabase.id, appInstance);

    return appInstance;
  }

  async getApp({ appId }) {
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
    return Object.fromEntries(this.#apps.entries());
  }

  async deleteApp({ appId }) {
    const appInstance = this.#apps.get(appId);
    if (!appInstance) {
      throw new Error(`App Not Found: ${appId}`);
    }

    appInstance.dispose();
    await appInstance.removeContainer({ force: true });
    await appInstance.db.destroy();
    this.#apps.delete(appId);
  }

}

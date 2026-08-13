import Docker from '../services/Docker.mjs';
import SQLite from '../services/SQLite.mjs';

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

      // Create Default Apps
      const appPlex = Array.from(this.#apps.values()).find(app => app.name === 'Plex');
      if (!appPlex) {
        await this.createApp({
          name: 'Plex',
          subdomain: 'plex',
          port: 32400,
          tls: 'only_https',
          dockerImage: 'linuxserver/plex',
        });
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
    dockerEnvironment = {},
  }) {
    const appsRegistry = await this.getAppsRegistry();
    const appRegistry = appsRegistry[registryId];
    if (!appRegistry) {
      throw new Error(`App Not Found in Registry: ${registryId}`);
    }

    return this.createApp({
      name: appRegistry.name,
      subdomain,
      port: appRegistry.port,
      tls,
      registryId,
      registryVersion: appRegistry.version,
      dockerImage: appRegistry.dockerImage,
      // dockerVolumes: appRegistry.dockerVolumes, // TODO
      dockerPorts: appRegistry.dockerPorts,
      dockerEnvironment: {
        ...appRegistry.dockerEnvironment,
        ...dockerEnvironment,
      },
      dockerPrivileged: appRegistry.dockerPrivileged,
      dockerCapabilities: appRegistry.dockerCapabilities,
    });
  }

  async createApp({
    name = 'New App',
    subdomain = null,
    port = null,
    url = null,
    tls = 'only_https',
    registryId = null,
    registryVersion = null,
    dockerImage = null,
    dockerVolumes = [],
    dockerPorts = [],
    dockerEnvironment = {},
    dockerPrivileged = false,
    dockerCapabilities = [],
  }) {
    const AppDatabase = await SQLite.getModelApp();
    const appDatabase = await AppDatabase.create({
      name,
      subdomain,
      port,
      url,
      tls,
      registryId,
      registryVersion,
      dockerImage,
      dockerVolumes,
      dockerPorts,
      dockerEnvironment,
      dockerPrivileged,
      dockerCapabilities,
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

  async getApps() {
    return Object.fromEntries(this.#apps.entries());
  }

  async deleteApp({ appId }) {
    const appInstance = this.#apps.get(appId);
    if (!appInstance) {
      throw new Error(`App Not Found: ${appId}`);
    }

    await appInstance.removeContainer();
    await appInstance.db.destroy();
    this.#apps.delete(appId);
  }

}
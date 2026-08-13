import debug from 'debug';

import SQLite from '../services/SQLite.mjs';

export default class Proxies {

  debug = debug('Proxies');

  async getProxies() {
    const Proxy = await SQLite.getModelProxy();
    const proxies = await Proxy.findAll();
    return Object.fromEntries(proxies.map(proxy => [proxy.id, proxy.toJSON()]));
  }

  async getProxy({ proxyId }) {
    const Proxy = await SQLite.getModelProxy();
    const proxy = await Proxy.findByPk(proxyId);
    if (!proxy) throw new Error(`Proxy Not Found: ${proxyId}`);
    return proxy;
  }

  async createProxy({
    subdomain,
    tls = 'only_https',
    sourceUrl,
  }) {
    const Proxy = await SQLite.getModelProxy();
    const App = await SQLite.getModelApp();
    if (subdomain && await App.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by an app: ${subdomain}`);
    }
    const proxy = await Proxy.create({
      subdomain,
      tls,
      sourceUrl,
    });
    this.debug(`Created ${proxy.subdomain} -> ${proxy.sourceUrl}`);
    return proxy;
  }

  async updateProxy({
    proxyId,
    subdomain,
    tls,
    sourceUrl,
  }) {
    const proxy = await this.getProxy({ proxyId });
    const App = await SQLite.getModelApp();
    if (subdomain && await App.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by an app: ${subdomain}`);
    }

    proxy.set({
      subdomain,
      tls,
      sourceUrl,
    });
    await proxy.save();
    this.debug(`Updated ${proxy.subdomain} -> ${proxy.sourceUrl}`);
    return proxy;
  }

  async deleteProxy({ proxyId }) {
    const proxy = await this.getProxy({ proxyId });
    await proxy.destroy();
    this.debug(`Deleted ${proxy.subdomain}`);
  }

}

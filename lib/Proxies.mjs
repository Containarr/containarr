import debug from 'debug';

import SQLite from '../services/SQLite.mjs';
import Firewall from '../services/Firewall.mjs';

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
    policyId = 'public',
  }) {
    await Firewall.getPolicy({ policyId });
    const Proxy = await SQLite.getModelProxy();
    const App = await SQLite.getModelApp();
    if (subdomain && await App.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by an app: ${subdomain}`);
    }
    const proxy = await Proxy.create({
      subdomain,
      tls,
      sourceUrl,
      policyId,
    });
    this.debug(`Created ${proxy.subdomain} -> ${proxy.sourceUrl}`);
    return proxy;
  }

  async updateProxy({
    proxyId,
    subdomain,
    tls,
    sourceUrl,
    policyId,
  }) {
    const proxy = await this.getProxy({ proxyId });
    policyId = policyId ?? proxy.policyId;
    await Firewall.getPolicy({ policyId });
    const App = await SQLite.getModelApp();
    if (subdomain && await App.findOne({ where: { subdomain } })) {
      throw new Error(`Subdomain is already used by an app: ${subdomain}`);
    }

    proxy.set({
      subdomain,
      tls,
      sourceUrl,
      policyId,
    });
    await proxy.save();
    this.debug(`Updated ${proxy.subdomain} -> ${proxy.sourceUrl}`);
    return proxy;
  }

  async setDisabled({ proxyId, disabled }) {
    if (typeof disabled !== 'boolean') {
      throw new Error('disabled must be a boolean.');
    }

    const proxy = await this.getProxy({ proxyId });
    proxy.disabled = disabled;
    await proxy.save();
    return proxy;
  }

  async deleteProxy({ proxyId }) {
    const proxy = await this.getProxy({ proxyId });
    await proxy.destroy();
    this.debug(`Deleted ${proxy.subdomain}`);
  }

}

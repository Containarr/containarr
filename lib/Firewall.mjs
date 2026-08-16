import net from 'node:net';

import SQLite from '../services/SQLite.mjs';

export default class Firewall {

  constructor() {
    this.ready = Promise.resolve().then(async () => {
      const Policy = await SQLite.getModelPolicy();
      await Policy.findOrCreate({
        where: { id: 'public' },
        defaults: {
          name: 'Public',
          allowedIps: [],
        },
      });
    });
  }

  async getPolicies() {
    await this.ready;
    const Policy = await SQLite.getModelPolicy();
    const policies = await Policy.findAll();
    policies.sort((left, right) => {
      if (left.id === 'public') return -1;
      if (right.id === 'public') return 1;
      return left.name.localeCompare(right.name);
    });
    return Object.fromEntries(policies.map(policy => [policy.id, policy]));
  }

  async getPolicy({ policyId }) {
    await this.ready;
    const Policy = await SQLite.getModelPolicy();
    const policy = await Policy.findOne({ where: { id: policyId } });
    if (!policy) throw new Error(`Policy Not Found: ${policyId}`);
    return policy;
  }

  async createPolicy({ name, allowedIps = [] }) {
    await this.ready;
    const Policy = await SQLite.getModelPolicy();
    return Policy.create({ name, allowedIps });
  }

  async updatePolicy({ policyId, name, allowedIps }) {
    if (policyId === 'public') {
      throw new Error('The Public policy cannot be changed.');
    }
    const policy = await this.getPolicy({ policyId });
    policy.set({ name, allowedIps });
    await policy.save();
    return policy;
  }

  async deletePolicy({ policyId }) {
    if (policyId === 'public') {
      throw new Error('The Public policy cannot be deleted.');
    }
    const policy = await this.getPolicy({ policyId });
    const Apps = (await import('../services/Apps.mjs')).default;
    const apps = await Apps.getApps();
    for (const app of Object.values(apps)) {
      if (app.policyId !== policyId) continue;
      app.db.policyId = 'public';
      await app.db.save();
    }
    const Proxy = await SQLite.getModelProxy();
    await Proxy.update({ policyId: 'public' }, { where: { policyId } });
    await policy.destroy();
  }

  async isAllowed({ policyId, address }) {
    if (policyId === 'public') return true;
    const policy = await this.getPolicy({ policyId }).catch(() => null);
    if (!policy || !address) return false;

    let clientAddress = address.split(',')[0].trim();
    if (clientAddress.startsWith('::ffff:')) clientAddress = clientAddress.slice(7);
    const family = net.isIP(clientAddress);
    if (!family) return false;

    const blockList = new net.BlockList();
    for (const entry of policy.allowedIps) {
      const [network, prefix] = entry.split('/');
      const entryFamily = net.isIP(network);
      if (entryFamily !== family) continue;
      if (prefix === undefined) {
        blockList.addAddress(network, entryFamily === 4 ? 'ipv4' : 'ipv6');
      } else {
        blockList.addSubnet(network, Number(prefix), entryFamily === 4 ? 'ipv4' : 'ipv6');
      }
    }
    return blockList.check(clientAddress, family === 4 ? 'ipv4' : 'ipv6');
  }

}

import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // listNetworks
  .get('/', async (req, res) => {
    const networks = await Docker.getNetworks();
    res.json(networks.map(network => ({
      id: network.Id,
      name: network.Name,
      driver: network.Driver,
      scope: network.Scope,
      created: network.Created,
      internal: network.Internal,
      attachable: network.Attachable,
      ingress: network.Ingress,
      containers: Object.entries(network.Containers ?? {}).map(([containerId, container]) => ({
        id: containerId,
        name: container.Name || containerId.slice(0, 12),
      })),
      deletable: Object.keys(network.Containers ?? {}).length === 0
        && !network.Ingress
        && !['bridge', 'host', 'none'].includes(network.Name),
      subnets: (network.IPAM?.Config ?? [])
        .map(config => config.Subnet)
        .filter(Boolean),
      labels: network.Labels ?? {},
    })));
  })

  // cleanupNetworks
  .post('/cleanup', async (req, res) => {
    const result = await Docker.cleanupNetworks();
    res.json({
      deleted: result.NetworksDeleted ?? [],
    });
  })

  // deleteNetwork
  .delete('/:networkId', async (req, res) => {
    await Docker.deleteNetwork({ networkId: req.params.networkId });
    res.status(204).send();
  });

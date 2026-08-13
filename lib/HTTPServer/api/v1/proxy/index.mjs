import express from 'express';

import Proxies from '../../../../../services/Proxies.mjs';

export default express()

  // listProxies
  .get('/', async (req, res) => {
    const proxies = await Proxies.getProxies();
    res.status(200).json(proxies);
  })

  // createProxy
  .post('/', async (req, res) => {
    const { subdomain, tls, sourceUrl } = req.body;
    const proxy = await Proxies.createProxy({ subdomain, tls, sourceUrl });
    res.status(201).json(proxy);
  })

  // getProxy
  .get('/:proxyId', async (req, res) => {
    const proxy = await Proxies.getProxy({ proxyId: req.params.proxyId });
    res.status(200).json(proxy);
  })

  // updateProxy
  .put('/:proxyId', async (req, res) => {
    const { subdomain, tls, sourceUrl } = req.body;
    const proxy = await Proxies.updateProxy({
      proxyId: req.params.proxyId,
      subdomain,
      tls,
      sourceUrl,
    });
    res.status(200).json(proxy);
  })

  // deleteProxy
  .delete('/:proxyId', async (req, res) => {
    await Proxies.deleteProxy({ proxyId: req.params.proxyId });
    res.status(204).send();
  });

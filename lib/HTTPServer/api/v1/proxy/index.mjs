import express from 'express';

import Proxies from '../../../../../services/Proxies.mjs';
import Backups from '../../../../../services/Backups.mjs';
import LetsEncrypt from '../../../../../services/LetsEncrypt.mjs';

export default express()

  // listProxies
  .get('/', async (req, res) => {
    const proxies = await Proxies.getProxies();
    res.status(200).json(await LetsEncrypt.decorateResources(proxies));
  })

  // createProxy
  .post('/', async (req, res) => {
    const { subdomain, tls, sourceUrl, policyId } = req.body;
    const proxy = await Proxies.createProxy({ subdomain, tls, sourceUrl, policyId });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(201).json(await LetsEncrypt.decorateResource(proxy));
  })

  // getProxy
  .get('/:proxyId', async (req, res) => {
    const proxy = await Proxies.getProxy({ proxyId: req.params.proxyId });
    res.status(200).json(await LetsEncrypt.decorateResource(proxy));
  })

  // updateProxy
  .put('/:proxyId', async (req, res) => {
    const { subdomain, tls, sourceUrl, policyId } = req.body;
    const proxy = await Proxies.updateProxy({
      proxyId: req.params.proxyId,
      subdomain,
      tls,
      sourceUrl,
      policyId,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(proxy));
  })

  // setProxyDisabled
  .put('/:proxyId/disabled', async (req, res) => {
    const proxy = await Proxies.setDisabled({
      proxyId: req.params.proxyId,
      disabled: req.body.disabled,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(proxy));
  })

  // retryProxyCertificate
  .post('/:proxyId/certificate/retry', async (req, res) => {
    const proxy = await Proxies.getProxy({ proxyId: req.params.proxyId });
    await LetsEncrypt.retry(proxy);
    res.status(204).send();
  })

  // deleteProxy
  .delete('/:proxyId', async (req, res) => {
    await Proxies.deleteProxy({ proxyId: req.params.proxyId });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(204).send();
  });

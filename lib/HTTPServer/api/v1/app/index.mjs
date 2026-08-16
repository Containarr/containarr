import express from 'express';
import Apps from '../../../../../services/Apps.mjs';
import Backups from '../../../../../services/Backups.mjs';
import LetsEncrypt from '../../../../../services/LetsEncrypt.mjs';

export default express()

  // listApps
  .get('/', async (req, res) => {
    const apps = await Apps.getApps();
    res.status(200).json(await LetsEncrypt.decorateResources(apps));
  })

  // getAppsRegistry
  .get('/registry', async (req, res) => {
    const appsRegistry = await Apps.getAppsRegistry();
    res.status(200).json(appsRegistry);
  })

  // createAppFromAppsRegistry
  .post('/registry', async (req, res) => {
    const {
      registryId,
      subdomain,
      tls,
      dockerEnvironment,
      dockerVolumes,
      dockerDevices,
      dockerPorts,
      dockerUserId,
      dockerGroupId,
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      dockerNetworkMode,
      policyId,
    } = req.body;

    const app = await Apps.createAppFromAppsRegistry({
      registryId,
      subdomain,
      tls,
      dockerEnvironment,
      dockerVolumes,
      dockerDevices,
      dockerPorts,
      dockerUserId,
      dockerGroupId,
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      dockerNetworkMode,
      policyId,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(201).json(await LetsEncrypt.decorateResource(app));
  })

  // createApp
  .post('/', async (req, res) => {
    const {
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
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    } = req.body;

    const app = await Apps.createApp({
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
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(201).json(await LetsEncrypt.decorateResource(app));
  })

  // getApp
  .get('/:appId', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // updateApp
  .put('/:appId', async (req, res) => {
    const {
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
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    } = req.body;

    const app = await Apps.updateApp({
      appId: req.params.appId,
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
      dockerAutoStart,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // getAppLogo
  .get('/:appId/logo', async (req, res) => {
    const { appId } = req.params;
    const logo = await Apps.getAppLogo({ appId });
    if (!logo) return res.status(404).send();
    res.type('png').status(200).send(logo);
  })

  // retryAppCertificate
  .post('/:appId/certificate/retry', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await LetsEncrypt.retry(app);
    res.status(204).send();
  })

  // setAppAutoUpdate
  .put('/:appId/auto-update', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await app.setAutoUpdate(req.body.enabled);
    Backups.backupSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // checkAppImageUpdate
  .post('/:appId/update/check', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await app.checkImageUpdate();
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // applyAppImageUpdate
  .post('/:appId/update/apply', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await app.checkImageUpdate({ applyUpdate: true });
    Backups.backupSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // startApp
  .post('/:appId/start', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    await app.startContainer();
    res.status(204).send();
  })

  // stopApp
  .post('/:appId/stop', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    await app.stopContainer();
    res.status(204).send();
  })

  // recreateApp
  .post('/:appId/recreate', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    await app.recreateContainer();
    res.status(204).send();
  })

  // restartApp
  .post('/:appId/restart', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    await app.restartContainer();
    res.status(204).send();
  })

  .delete('/:appId', async (req, res) => {
    const { appId } = req.params;
    await Apps.deleteApp({ appId });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(204).send();
  });

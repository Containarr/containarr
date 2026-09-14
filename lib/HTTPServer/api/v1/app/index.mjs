import express from 'express';
import Apps from '../../../../../services/Apps.mjs';
import Docker from '../../../../../services/Docker.mjs';
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
      port,
      dockerEnvironment,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      dockerNetworkMode,
      dockerNetworks,
      policyId,
    } = req.body;

    const app = await Apps.createAppFromAppsRegistry({
      registryId,
      subdomain,
      tls,
      port,
      dockerEnvironment,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      dockerNetworkMode,
      dockerNetworks,
      policyId,
    });
    LetsEncrypt.refreshSoon();
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
      dockerNetworks,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
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
      dockerNetworks,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    });
    LetsEncrypt.refreshSoon();
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
      dockerNetworks,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
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
      dockerNetworks,
      dockerVolumes,
      backupVolumes,
      dockerDevices,
      dockerPorts,
      dockerEnvironment,
      dockerUserId,
      dockerGroupId,
      dockerPrivileged,
      dockerCapabilities,
      policyId,
    });
    LetsEncrypt.refreshSoon();
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // calculateAppVolumeSize
  .post('/:appId/volume/size', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    const volumes = Array.isArray(app.db.dockerVolumes)
      ? app.db.dockerVolumes : Object.values(app.db.dockerVolumes ?? {});
    const volume = req.body?.volume;
    if (typeof volume !== 'string' || !volumes.includes(volume)) {
      throw Object.assign(new Error('Choose a configured app volume.'), { statusCode: 400 });
    }
    const size = await Docker.calculateVolumeSize({ volume });
    res.status(200).json({ size });
  })

  // updateAppLogo
  .put('/:appId/logo', async (req, res) => {
    const app = await Apps.updateAppLogo({ appId: req.params.appId, logo: req.body?.logo });
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // getAppLogo
  .get('/:appId/logo', async (req, res) => {
    const { appId } = req.params;
    const logo = await Apps.getAppLogo({ appId });
    if (!logo) return res.status(404).send();
    res.set('Cache-Control', 'private, no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
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
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // setAppDisabled
  .put('/:appId/disabled', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await app.setDisabled(req.body.disabled);
    LetsEncrypt.refreshSoon();
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
    res.status(200).json(await LetsEncrypt.decorateResource(app));
  })

  // recreateApp
  .post('/:appId/recreate', async (req, res) => {
    const app = await Apps.getApp({ appId: req.params.appId });
    await app.recreateContainer();
    res.status(204).send();
  })

  .delete('/:appId', async (req, res) => {
    const { appId } = req.params;
    await Apps.deleteApp({ appId });
    LetsEncrypt.refreshSoon();
    res.status(204).send();
  });

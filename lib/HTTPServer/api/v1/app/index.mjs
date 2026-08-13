import express from 'express';
import Apps from '../../../../../services/Apps.mjs';

export default express()

  // listApps
  .get('/', async (req, res) => {
    const apps = await Apps.getApps();
    res.status(200).json(apps);
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
    } = req.body;

    const app = await Apps.createAppFromAppsRegistry({
      registryId,
      subdomain,
      tls,
    });
    res.status(201).json(app);
  })

  // createApp
  .post('/', async (req, res) => {
    const {
      name,
      subdomain,
      port,
      url,
      tls,
      dockerImage,
      dockerVolumes,
      dockerPorts,
      dockerEnvironment,
      dockerPrivileged,
      dockerCapabilities,
    } = req.body;

    const app = await Apps.createApp({
      name,
      subdomain,
      port,
      url,
      tls,
      dockerImage,
      dockerVolumes,
      dockerPorts,
      dockerEnvironment,
      dockerPrivileged,
      dockerCapabilities,
    });
    res.status(201).json(app);
  })

  // getApp
  .get('/:appId', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.getApp({ appId });
    res.status(200).json(app);
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

  .delete('/:appId', async (req, res) => {
    const { appId } = req.params;
    const app = await Apps.deleteApp({ appId });
    res.status(204).send();
  });
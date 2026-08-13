import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // listContainers
  .get('/', async (req, res) => {
    const containers = await Docker.getContainers();
    res.json(containers.map(container => ({
      id: container.Id,
      name: container.Names.map(name => name.replace(/^\//, '')).join(', '),
      image: container.Image,
      state: container.State,
      status: container.Status,
      appId: container.Labels['containarr.app.id'] ?? null,
    })));
  })

  // getContainer
  .get('/:containerId', async (req, res) => {
    const { containerId } = req.params;
    const container = await Docker.getContainerInstance(containerId);
    const metadata = await container.inspect();

    res.json({
      id: metadata.Id,
      name: metadata.Name.replace(/^\//, ''),
      image: metadata.Config.Image,
      imageId: metadata.Image,
      state: metadata.State.Status,
      status: metadata.State.Status,
      appId: metadata.Config.Labels?.['containarr.app.id'] ?? null,
      created: metadata.Created,
      platform: metadata.Platform,
      restartCount: metadata.RestartCount,
      networkMode: metadata.HostConfig.NetworkMode,
      privileged: metadata.HostConfig.Privileged,
      ports: metadata.NetworkSettings.Ports ?? {},
      mounts: metadata.Mounts ?? [],
      environment: metadata.Config.Env ?? [],
    });
  })

  // startContainer
  .post('/:containerId/start', async (req, res) => {
    const container = await Docker.getContainerInstance(req.params.containerId);
    await container.start();
    res.status(204).send();
  })

  // stopContainer
  .post('/:containerId/stop', async (req, res) => {
    const container = await Docker.getContainerInstance(req.params.containerId);
    await container.stop();
    res.status(204).send();
  })

  // restartContainer
  .post('/:containerId/restart', async (req, res) => {
    const container = await Docker.getContainerInstance(req.params.containerId);
    await container.restart();
    res.status(204).send();
  })

  // deleteContainer
  .delete('/:containerId', async (req, res) => {
    const { containerId } = req.params;
    await Docker.deleteContainer({ containerId });
    res.status(204).send();
  });

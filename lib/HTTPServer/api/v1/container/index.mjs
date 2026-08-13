import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // getDockerHubUser
  .get('/dockerhub/users/:username', async (req, res) => {
    const { username } = req.params;

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(username)) {
      return res.status(400).json({ error: 'Invalid Docker Hub username.' });
    }

    const response = await fetch(
      `https://hub.docker.com/v2/users/${encodeURIComponent(username)}/`,
      { headers: { accept: 'application/json' } },
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Docker Hub user not found.' });
    }

    const user = await response.json();
    return res.json({
      gravatar_url: typeof user.gravatar_url === 'string' ? user.gravatar_url : null,
    });
  })

  // listContainers
  .get('/', async (req, res) => {
    const containers = await Docker.getContainers();
    res.json(containers.map(container => ({
      id: container.Id,
      name: container.Names.map(name => name.replace(/^\//, '')).join(', '),
      image: container.Image,
      state: container.State,
      status: container.Status,
      labels: container.Labels ?? {},
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
      labels: metadata.Config.Labels ?? {},
      created: metadata.Created,
      startedAt: metadata.State.StartedAt,
      finishedAt: metadata.State.FinishedAt,
      platform: metadata.Platform,
      restartCount: metadata.RestartCount,
      networkMode: metadata.HostConfig.NetworkMode,
      privileged: metadata.HostConfig.Privileged,
      ports: metadata.NetworkSettings.Ports ?? {},
      mounts: metadata.Mounts ?? [],
      environment: metadata.Config.Env ?? [],
    });
  })

  // getContainerStats
  .get('/:containerId/stats', async (req, res) => {
    const stats = await Docker.getContainerStats({
      containerId: req.params.containerId,
    });
    res.json(stats);
  })

  // getContainerLogs
  .get('/:containerId/logs', async (req, res) => {
    const requestedTail = Number.parseInt(req.query.tail, 10);
    const tail = Number.isFinite(requestedTail)
      ? Math.min(1000, Math.max(1, requestedTail))
      : 200;
    const logs = await Docker.getContainerLogs({
      containerId: req.params.containerId,
      tail,
    });

    res.json({ logs });
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

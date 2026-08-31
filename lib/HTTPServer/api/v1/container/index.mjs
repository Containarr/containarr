import express from 'express';
import Docker from '../../../../../services/Docker.mjs';
import Apps from '../../../../../services/Apps.mjs';
import Backups from '../../../../../services/Backups.mjs';
import LetsEncrypt from '../../../../../services/LetsEncrypt.mjs';
import { CONTAINARR_DEMO_MODE } from '../../../../../config.mjs';

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

  // listFilesystemPaths
  .get('/paths', async (req, res) => {
    res.json(await Docker.getPathSuggestions({
      source: req.query.source,
      requestedPath: req.query.path,
      image: req.query.image,
    }));
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
      importable: !container.Labels?.['containarr.app.id']
        && !(process.env.HOSTNAME && container.Id.startsWith(process.env.HOSTNAME)),
    })));
  })

  // cleanupContainers
  .post('/cleanup', async (req, res) => {
    const result = await Docker.cleanupContainers();
    res.json({
      deleted: result.ContainersDeleted ?? [],
      spaceReclaimed: result.SpaceReclaimed ?? 0,
    });
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
      importable: !metadata.Config.Labels?.['containarr.app.id']
        && !(process.env.HOSTNAME && metadata.Id.startsWith(process.env.HOSTNAME)),
    });
  })

  // getContainerStats
  .get('/:containerId/stats', async (req, res) => {
    if (CONTAINARR_DEMO_MODE) {
      let seed = 0;
      for (const character of req.params.containerId) {
        seed = ((seed * 31) + character.charCodeAt(0)) >>> 0;
      }
      const phase = (seed % 628) / 100;
      const now = Date.now();
      const demoHistory = Array.from({ length: 60 }, (_, index) => {
        const timestamp = now - (59 - index) * 1000;
        const seconds = timestamp / 1000;
        return {
          id: req.params.containerId,
          read: new Date(timestamp).toISOString(),
          cpuPercent: Math.max(1, Math.min(
            100,
            19
              + 8 * Math.sin(seconds / 7 + phase)
              + 3 * Math.sin(seconds / 2.3 + phase / 2),
          )),
          memoryUsage: Math.round(
            1.55 * 1024 ** 3
              + 210 * 1024 ** 2 * Math.sin(seconds / 18 + phase)
              + 60 * 1024 ** 2 * Math.sin(seconds / 5 + phase / 3),
          ),
          memoryLimit: 4 * 1024 ** 3,
          blockReadBytes: Math.round(
            seconds * 320 * 1024
              + 500 * 1024 * Math.sin(seconds / 7 + phase),
          ),
          blockWriteBytes: Math.round(
            seconds * 180 * 1024
              + 240 * 1024 * Math.sin(seconds / 5 + phase / 2),
          ),
          networkRxBytes: Math.round(
            seconds * 1.4 * 1024 ** 2
              + 3 * 1024 ** 2 * Math.sin(seconds / 6 + phase),
          ),
          networkTxBytes: Math.round(
            seconds * 650 * 1024
              + 1024 ** 2 * Math.sin(seconds / 5 + phase / 2),
          ),
        };
      });
      return res.json({
        ...demoHistory.at(-1),
        demoHistory,
      });
    }

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

  // previewContainerImport
  .get('/:containerId/import', async (req, res) => {
    res.status(200).json(await Apps.importContainer({
      containerId: req.params.containerId,
      preview: true,
    }));
  })

  // importContainer
  .post('/:containerId/import', async (req, res) => {
    const app = await Apps.importContainer({
      containerId: req.params.containerId,
      settings: req.body,
    });
    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(201).json(await LetsEncrypt.decorateResource(app));
  })

  // deleteContainer
  .delete('/:containerId', async (req, res) => {
    const { containerId } = req.params;
    await Docker.deleteContainer({ containerId });
    res.status(204).send();
  });

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
  });
import express from 'express';
import Traefik from '../../../../../services/Traefik.mjs';

export default express()

  // getTraefikConfig
  .get('/config', async (req, res) => {
    const traefikConfig = await Traefik.getConfig();
    res.json(traefikConfig);
  });
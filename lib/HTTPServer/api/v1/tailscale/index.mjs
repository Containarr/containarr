import express from 'express';

import Tailscale from '../../../../../services/Tailscale.mjs';

export default express()

  .get('/', async (req, res) => {
    res.status(200).json(await Tailscale.getSettings());
  })

  .put('/', async (req, res) => {
    try {
      res.status(200).json(await Tailscale.setSettings({
        clientId: req.body?.clientId,
        clientSecret: req.body?.clientSecret,
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })

  .get('/devices', async (req, res) => {
    try {
      res.status(200).json(await Tailscale.getDevices());
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

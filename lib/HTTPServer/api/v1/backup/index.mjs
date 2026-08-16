import express from 'express';

import Backups from '../../../../../services/Backups.mjs';

export default express()

  .get('/', async (req, res) => {
    res.status(200).json(await Backups.getSettings());
  })

  .put('/', async (req, res) => {
    try {
      res.status(200).json(await Backups.setSettings({
        repositoryUrl: req.body?.repositoryUrl,
        branch: req.body?.branch,
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })

  .post('/', async (req, res) => {
    try {
      await Backups.backup();
      res.status(200).json(await Backups.getSettings());
    } catch (error) {
      res.status(502).json({ error: error.stderr?.trim() || error.message });
    }
  });

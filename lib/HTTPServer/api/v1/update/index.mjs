import express from 'express';

import Updates from '../../../../../services/Updates.mjs';
import changelog from './changelog.mjs';

export default express()
  .use('/changelog', changelog)
  .get('/', async (req, res) => {
    res.status(200).json(await Updates.getStatus());
  })
  .post('/check', async (req, res) => {
    await Updates.check().catch(() => {});
    res.status(200).json(await Updates.getStatus());
  })
  .post('/install', async (req, res) => {
    res.status(202).json(await Updates.install());
  });

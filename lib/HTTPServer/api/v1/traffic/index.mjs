import express from 'express';
import Traffic from '../../../../../services/Traffic.mjs';

export default express()
  .get('/', async (req, res) => {
    res.json(await Traffic.list({ page: Number(req.query.page ?? 1) }));
  })
  .delete('/', async (req, res) => {
    await Traffic.clear();
    res.status(204).send();
  });

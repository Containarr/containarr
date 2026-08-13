import express from 'express';
import DDNS from '../../../../../services/DDNS.mjs';

export default express()

  // getDomain
  .get('/domain', async (req, res) => {
    const domain = await DDNS.getDomain();
    res.status(200).json({ domain });
  });

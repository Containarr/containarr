import express from 'express';

import Updates from '../../../../../services/Updates.mjs';

export default express()
  .get('/', async (req, res) => {
    res.status(200).json(await Updates.getStatus());
  });

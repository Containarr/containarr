import express from 'express';

import v1 from './v1/index.mjs';

export default express()
  .use('/v1', v1);
import express from 'express';

import app from './app/index.mjs';
import container from './container/index.mjs';
import traefik from './traefik/index.mjs';

export default express()
  .use('/app', app)
  .use('/container', container)
  .use('/traefik', traefik);
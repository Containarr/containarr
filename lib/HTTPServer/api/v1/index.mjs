import express from 'express';

import Auth from '../../../../services/Auth.mjs';
import app from './app/index.mjs';
import auth from './auth/index.mjs';
import container from './container/index.mjs';
import ddns from './ddns/index.mjs';
import proxy from './proxy/index.mjs';
import traefik from './traefik/index.mjs';

export default express()
  .use('/auth', auth)
  .use('/traefik', traefik)
  .use(async (req, res, next) => {
    const user = await Auth.authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    req.user = user;
    next();
  })
  .use('/app', app)
  .use('/container', container)
  .use('/ddns', ddns)
  .use('/proxy', proxy);

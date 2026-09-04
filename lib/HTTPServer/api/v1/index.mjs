import express from 'express';

import Auth from '../../../../services/Auth.mjs';
import app from './app/index.mjs';
import auth from './auth/index.mjs';
import backup from './backup/index.mjs';
import container from './container/index.mjs';
import ddns from './ddns/index.mjs';
import event from './event/index.mjs';
import firewall from './firewall/index.mjs';
import image from './image/index.mjs';
import network from './network/index.mjs';
import proxy from './proxy/index.mjs';
import traefik from './traefik/index.mjs';
import update from './update/index.mjs';
import volume from './volume/index.mjs';

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
  .use('/backup', backup)
  .use('/container', container)
  .use('/ddns', ddns)
  .use('/event', event)
  .use('/firewall', firewall)
  .use('/image', image)
  .use('/network', network)
  .use('/update', update)
  .use('/proxy', proxy)
  .use('/volume', volume);

import net from 'node:net';

import debug from 'debug';
import express from 'express';

import Traefik from '../services/Traefik.mjs';

import {
  PORT_ADMIN,
} from '../config.mjs';

export default class HTTPServer {

  debug = debug('HTTPServer');

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.set('trust proxy', true);
    this.app.listen(PORT_ADMIN, err => {
      if (err) {
        this.debug(err);
        return process.exit(1);
      }

      this.debug(`Listening on 0.0.0.0:${PORT_ADMIN}`);
    });


    this.app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    this.app.get('/traefik/config', async (req, res) => {
      const traefikConfig = await Traefik.getConfig();
      res.json(traefikConfig);
    });

    this.app.get('/traefik/offline', async (req, res) => {
      const appName = req.query.appName || 'Unknown App';
      res.send(`
        <h1>${appName} is Offline</h1>
        <p>The application is currently offline. Please check back later.</p>
      `);
    });

    this.app.use(express.static('./www'));
  }
}
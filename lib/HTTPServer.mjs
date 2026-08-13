import net from 'node:net';
import debug from 'debug';
import express from 'express';

import Traefik from '../services/Traefik.mjs';
import Docker from '../services/Docker.mjs';
import Apps from '../services/Apps.mjs';

import api from './HTTPServer/api/index.mjs';

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

    // getHealth
    this.app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    this.app.use('/api', api);

    this.app.use(express.static('./www'));
  }
}
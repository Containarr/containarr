import debug from 'debug';
import express from 'express';

import LetsEncrypt from '../services/LetsEncrypt.mjs';
import DDNS from '../services/DDNS.mjs';

import ContainerShell from './HTTPServer/ContainerShell.mjs';
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
    this.server = new Promise((resolve, reject) => {
      const server = this.app.listen(PORT_ADMIN, '127.0.0.1');
      server.once('error', reject);
      server.once('listening', () => {
        server.removeListener('error', reject);
        resolve(server);
      });
    });
    this.server
      .then(server => {
        this.containerShell = new ContainerShell(server);
        this.debug(`Listening on 127.0.0.1:${PORT_ADMIN}`);
      })
      .catch(err => {
        this.debug(err);
        process.exit(1);
      });

    // getHealth
    this.app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    this.app.get('/.well-known/acme-challenge/:token', (req, res) => {
      const keyAuthorization = LetsEncrypt.getChallenge(req.params.token);
      this.debug(
        `ACME challenge request for ${req.hostname}: ${req.params.token} (${keyAuthorization ? 'found' : 'not found'})`,
      );
      if (!keyAuthorization) return res.status(404).send();
      res.type('text/plain').status(200).send(keyAuthorization);
    });

    // Identify this installation through containarr-check.<domain>
    this.app.get('/', async (req, res, next) => {
      if (!req.hostname.startsWith('containarr-check.')) return next();
      res.type('text/plain').status(200).send(await DDNS.getGeneratedDomain());
    });

    this.app.use('/api', api);

    this.app.use('/api', (req, res) => {
      res.status(404).json({ error: 'API endpoint not found.' });
    });

    this.app.use('/api', (error, req, res, next) => {
      if (res.headersSent) return next(error);

      const requestedStatusCode = error?.statusCode ?? error?.status;
      const statusCode = Number.isInteger(requestedStatusCode)
        && requestedStatusCode >= 400
        && requestedStatusCode <= 599
        ? requestedStatusCode
        : 500;
      const message = typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : 'An unexpected error occurred.';

      console.error(error);
      res.status(statusCode).json({ error: message });
    });

    this.app.use(express.static('./public'));
  }

  async getServer() {
    await this.server;
    return this.app;
  }
}

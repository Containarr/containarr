import net from 'node:net';
import fs from 'node:fs/promises';
import debug from 'debug';
import express from 'express';

import Traefik from '../services/Traefik.mjs';
import Docker from '../services/Docker.mjs';
import Apps from '../services/Apps.mjs';
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
    this.server = this.app.listen(PORT_ADMIN, err => {
      if (err) {
        this.debug(err);
        return process.exit(1);
      }

      this.debug(`Listening on 0.0.0.0:${PORT_ADMIN}`);
    });
    this.containerShell = new ContainerShell(this.server);

    // getHealth
    this.app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    this.app.get('/.well-known/acme-challenge/:token', (req, res) => {
      const keyAuthorization = LetsEncrypt.getChallenge(req.params.token);
      if (!keyAuthorization) return res.status(404).send();
      res.type('text/plain').status(200).send(keyAuthorization);
    });

    // Identify this installation through containarr-check.<domain>
    this.app.get('/', async (req, res, next) => {
      if (!req.hostname.startsWith('containarr-check.')) return next();
      res.type('text/plain').status(200).send(await DDNS.getGeneratedDomain());
    });

    this.app.get('/.containarr/errors/401', async (req, res) => {
      let address = req.get('x-forwarded-for')?.split(',')[0].trim()
        || req.get('x-real-ip')
        || req.socket.remoteAddress
        || 'unknown';
      if (address.startsWith('::ffff:')) address = address.slice(7);
      if (!net.isIP(address)) address = 'unknown';

      res.type('html').status(401).send(
        (await fs.readFile(
          new URL('./HTTPServer/static/401.html', import.meta.url),
          'utf8',
        )).replace('{{REQUESTER_IP}}', address),
      );
    });

    this.app.use('/api', api);

    this.app.use(express.static('./public'));
  }
}

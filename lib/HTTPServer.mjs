import net from 'node:net';

import debug from 'debug';
import express from 'express';

import Traefik from '../services/Traefik.mjs';
import Docker from '../services/Docker.mjs';
import Apps from '../services/Apps.mjs';

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

    // getTraefikConfig
    this.app.get('/traefik/config', async (req, res) => {
      const traefikConfig = await Traefik.getConfig();
      res.json(traefikConfig);
    });

    // listContainers
    this.app.get('/api/v1/container', async (req, res) => {
      const containers = await Docker.getContainers();
      res.json(containers.map(container => ({
        id: container.Id,
        name: container.Names.map(name => name.replace(/^\//, '')).join(', '),
        image: container.Image,
        state: container.State,
        status: container.Status,
        appId: container.Labels['containarr.app.id'] ?? null,
      })));
    });

    // listApps
    this.app.get('/api/v1/app', async (req, res) => {
      const apps = await Apps.getApps();
      res.json(Object.values(apps).map(app => app.toJSON()));
    });

    // startApp
    this.app.post('/api/v1/app/:appId/start', async (req, res) => {
      const { appId } = req.params;
      const app = await Apps.getApp({ appId });
      await app.startContainer();
      res.status(204).send();
    });

    // stopApp
    this.app.post('/api/v1/app/:appId/stop', async (req, res) => {
      const { appId } = req.params;
      const app = await Apps.getApp({ appId });
      await app.stopContainer();
      res.status(204).send();
    });

    // recreateApp
    this.app.post('/api/v1/app/:appId/recreate', async (req, res) => {
      const { appId } = req.params;
      const app = await Apps.getApp({ appId });
      await app.recreateContainer();
      res.status(204).send();
    });

    this.app.use(express.static('./www'));
  }
}
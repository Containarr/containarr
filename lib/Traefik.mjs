import fs from 'node:fs/promises';
import child_process from 'node:child_process';
import readline from 'node:readline';
import debug from 'debug';

import Settings from '../services/Settings.mjs';
import DDNS from '../services/DDNS.mjs';
import Apps from '../services/Apps.mjs';

import {
  PORT_HTTP,
  PORT_HTTPS,
  PORT_ADMIN,
} from '../config.mjs';

export default class Traefik {

  debug = debug('Traefik');

  #process = null;
  #hosts = new Map();

  constructor() {
    this.#process = Promise.resolve().then(async () => {
      await fs.mkdir('/data/letsencrypt', { recursive: true });

      const traefik = child_process.spawn('traefik', [
        `--entrypoints.http.address=0.0.0.0:${PORT_HTTP}`,
        `--entrypoints.https.address=0.0.0.0:${PORT_HTTPS}`,
        `--providers.http.endpoint=http://127.0.0.1:${PORT_ADMIN}/traefik/config`,
        `--providers.http.pollInterval=1s`,
        `--certificatesresolvers.le.acme.email=lets-encrypt@containarr.com`,
        `--certificatesresolvers.le.acme.storage=/data/letsencrypt/acme.json`,
        `--certificatesresolvers.le.acme.httpchallenge.entrypoint=web`,
      ], {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      // stdout
      readline.createInterface({
        input: traefik.stdout,
      }).on('line', (line) => this.debug(`[stdout] ${line}`));

      // stderr
      readline.createInterface({
        input: traefik.stderr,
      }).on('line', (line) => this.debug(`[stderr] ${line}`));

      traefik.once('close', (code) => {
        this.debug(`Traefik exited with code ${code}`);
        traefik.kill();
        process.exit(1);
      });

      process.once('SIGINT', () => {
        this.debug('Shutting down...');
        traefik?.kill();
        process.exit(0);
      });

      return new Promise((resolve, reject) => {
        traefik.once('error', (err) => reject(err));

        traefik.once('spawn', () => resolve());
      });
    });

    this.#process
      .then(() => this.debug('Ready'))
      .catch(err => {
        this.debug(err);
        process.exit(1);
      });
  }

  async getConfig() {
    const domain = await DDNS.getDomain();
    const config = {
      http: {
        routers: {
          'containarr': {
            rule: `Host(\`localhost\`)`,
            service: 'containarr',
            entryPoints: ['http'],
          },
        },
        services: {
          'containarr': {
            loadBalancer: {
              servers: [
                {
                  url: `http://localhost:${PORT_ADMIN}`,
                },
              ],
            },
          },
        },
      },
    };

    // Add Services
    const apps = await Apps.getApps();
    for (const app of Object.values(apps)) {
      const serviceId = `app-${app.id}`;

      config.http.routers[serviceId] = {
        rule: `Host(\`${app.subdomain}.${domain}\`)`,
        service: serviceId,
        entryPoints: ['http'],
      };

      config.http.services[serviceId] = {
        loadBalancer: {
          servers: [
            {
              url: app.url || 'http://localhost:1',
            },
          ],
        },
      };
    };

    // Add Proxies
    // TODO

    // console.log(JSON.stringify(config, false, 2));

    return config;
  }
}
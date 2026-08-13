import child_process from 'node:child_process';
import readline from 'node:readline';
import debug from 'debug';

import Settings from '../services/Settings.mjs';
import DDNS from '../services/DDNS.mjs';
import LetsEncrypt from '../services/LetsEncrypt.mjs';
import Apps from '../services/Apps.mjs';
import Proxies from '../services/Proxies.mjs';

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
      const traefik = child_process.spawn('traefik', [
        // `--log.level=DEBUG`,
        `--entrypoints.http.address=0.0.0.0:${PORT_HTTP}`,
        `--entrypoints.https.address=0.0.0.0:${PORT_HTTPS}`,
        `--providers.http.endpoint=http://127.0.0.1:${PORT_ADMIN}/api/v1/traefik/config`,
        `--providers.http.pollInterval=1s`,
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
    const [domain, certificates] = await Promise.all([
      DDNS.getDomain(),
      LetsEncrypt.getTraefikCertificates(),
    ]);
    const config = {
      http: {
        routers: {
          'containarr': {
            rule: `Host(\`localhost\`)`,
            service: 'containarr',
            entryPoints: ['http'],
            // middlewares: ['ipWhitelist'],
          },
          'acme-http-challenge': {
            rule: 'PathPrefix(`/.well-known/acme-challenge/`)',
            service: 'containarr',
            entryPoints: ['http'],
            priority: 10000,
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
        serversTransports: {
          'insecure-upstream': {
            insecureSkipVerify: true,
          },
        },
        middlewares: {
          'redirect-http-to-https': {
            redirectScheme: {
              scheme: 'https',
              permanent: true,
            },
          },
        },
        // middlewares: {
        //   'ipWhitelist': {
        //     ipWhiteList: {
        //       sourceRange: ['0.0.0.0/32'], // TODO
        //     },
        //   },
        // },
      },
      tls: {
        certificates,
      },
    };

    // Add Services
    const apps = await Apps.getApps();
    for (const app of Object.values(apps)) {
      const id = `app-${app.id}`;
      const hostname = `${app.subdomain}.${domain}`;

      config.http.services[id] = {
        loadBalancer: {
          servers: [{ url: app.url || 'http://localhost:1' }],
        },
      };

      switch (app.tls || 'only_https') {
        case 'only_http':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
          };
          break;
        case 'only_https':
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        case 'both_http_and_https':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
          };
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        case 'redirect_http_to_https':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
            middlewares: ['redirect-http-to-https'],
          };
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        default:
          throw new Error(`Invalid TLS mode: ${app.tls}`);
      }
    };

    // Add Proxies
    const proxies = await Proxies.getProxies();
    for (const proxy of Object.values(proxies)) {
      const id = `proxy-${proxy.id}`;
      const hostname = `${proxy.subdomain}.${domain}`;

      config.http.services[id] = {
        loadBalancer: {
          servers: [{ url: proxy.sourceUrl }],
          serversTransport: 'insecure-upstream',
        },
      };

      switch (proxy.tls) {
        case 'only_http':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
          };
          break;
        case 'only_https':
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        case 'both_http_and_https':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
          };
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        case 'redirect_http_to_https':
          config.http.routers[`${id}-http`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['http'],
            middlewares: ['redirect-http-to-https'],
          };
          config.http.routers[`${id}-https`] = {
            rule: `Host(\`${hostname}\`)`,
            service: id,
            entryPoints: ['https'],
            tls: {},
          };
          break;
        default:
          throw new Error(`Invalid TLS mode: ${proxy.tls}`);
      }
    }

    // console.log(JSON.stringify(config, false, 2));

    return config;
  }
}

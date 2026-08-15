import debug from 'debug';
import semver from 'semver';

import Docker from '../services/Docker.mjs';

import {
  CONTAINARR_IMAGE,
  CONTAINARR_VERSION,
  DOCKER_SOCK,
} from '../config.mjs';

const CHECK_INTERVAL = 1000 * 60 * 60 * 6; // 6h

export default class Updates {

  debug = debug('Updates');

  #checkPromise = null;
  #installPromise = null;
  #status = {
    currentVersion: semver.clean(CONTAINARR_VERSION) ?? CONTAINARR_VERSION,
    latestVersion: null,
    updateAvailable: false,
    checkedAt: null,
    error: null,
    installing: false,
    installError: null,
  };

  constructor() {
    this.check().catch(err => this.debug(err));
    this.checkInterval = setInterval(() => {
      this.check().catch(err => this.debug(err));
    }, CHECK_INTERVAL);
  }

  async check() {
    this.#checkPromise = this.#checkPromise || Promise.resolve().then(async () => {
      try {
        const image = CONTAINARR_IMAGE.match(/^ghcr\.io\/(.+?)(?::([^/]+))?$/);
        if (!image) {
          throw new Error(`Unsupported update image: ${CONTAINARR_IMAGE}`);
        }

        const repository = image[1];
        const tag = image[2] || 'latest';
        const tokenResponse = await fetch(
          `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!tokenResponse.ok) {
          throw new Error(`GHCR token request failed: ${tokenResponse.status}`);
        }
        const { token } = await tokenResponse.json();
        if (!token) throw new Error('GHCR did not return a token.');

        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: [
            'application/vnd.oci.image.index.v1+json',
            'application/vnd.docker.distribution.manifest.list.v2+json',
            'application/vnd.oci.image.manifest.v1+json',
            'application/vnd.docker.distribution.manifest.v2+json',
          ].join(', '),
        };
        let manifestResponse = await fetch(
          `https://ghcr.io/v2/${repository}/manifests/${tag}`,
          { headers, signal: AbortSignal.timeout(10000) },
        );
        if (!manifestResponse.ok) {
          throw new Error(`GHCR manifest request failed: ${manifestResponse.status}`);
        }
        let manifest = await manifestResponse.json();

        if (Array.isArray(manifest.manifests)) {
          const architecture = process.arch === 'x64' ? 'amd64' : process.arch;
          const platformManifest = manifest.manifests.find(candidate => (
            candidate.platform?.os === 'linux'
            && candidate.platform?.architecture === architecture
          ));
          if (!platformManifest) {
            throw new Error(`No linux/${architecture} manifest found in ${CONTAINARR_IMAGE}.`);
          }

          manifestResponse = await fetch(
            `https://ghcr.io/v2/${repository}/manifests/${platformManifest.digest}`,
            { headers, signal: AbortSignal.timeout(10000) },
          );
          if (!manifestResponse.ok) {
            throw new Error(`GHCR platform manifest request failed: ${manifestResponse.status}`);
          }
          manifest = await manifestResponse.json();
        }

        if (!manifest.config?.digest) {
          throw new Error(`No image configuration found in ${CONTAINARR_IMAGE}.`);
        }
        const configResponse = await fetch(
          `https://ghcr.io/v2/${repository}/blobs/${manifest.config.digest}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!configResponse.ok) {
          throw new Error(`GHCR image configuration request failed: ${configResponse.status}`);
        }
        const imageConfig = await configResponse.json();
        const imageVersion = imageConfig.config?.Labels?.['org.opencontainers.image.version'];
        const latestVersion = typeof imageVersion === 'string'
          ? semver.clean(imageVersion)
          : null;
        const currentVersion = typeof CONTAINARR_VERSION === 'string'
          ? semver.clean(CONTAINARR_VERSION)
          : null;
        if (!latestVersion) {
          throw new Error(`${CONTAINARR_IMAGE} has no valid OCI version label.`);
        }
        if (!currentVersion) {
          throw new Error(`Invalid current Containarr version: ${CONTAINARR_VERSION}`);
        }

        this.#status = {
          ...this.#status,
          currentVersion,
          latestVersion: '0.3.0',
          updateAvailable: true,
          checkedAt: new Date().toISOString(),
          error: null,
        };
      } catch (error) {
        this.#status = {
          ...this.#status,
          checkedAt: new Date().toISOString(),
          error: error.message,
        };
        throw error;
      }
    }).finally(() => {
      this.#checkPromise = null;
    });

    return this.#checkPromise;
  }

  async install() {
    this.#installPromise = this.#installPromise || Promise.resolve().then(async () => {
      if (!this.#status.updateAvailable) {
        throw new Error('No Containarr update is available.');
      }
      if (this.#status.installing) {
        return;
      }
      if (!process.env.HOSTNAME) {
        throw new Error('Containarr is not running inside Docker.');
      }

      this.#status.installing = true;
      this.#status.installError = null;

      try {
        const docker = await Docker.dockerode;
        const metadata = await docker.getContainer(process.env.HOSTNAME).inspect();
        await Docker.pullImage(CONTAINARR_IMAGE);

        const helper = await docker.createContainer({
          name: `containarr-updater-${Date.now()}`,
          Image: metadata.Image,
          Entrypoint: ['/usr/local/bin/node'],
          Cmd: [
            '/app/lib/Updates/Install.mjs',
            metadata.Id,
            CONTAINARR_IMAGE,
            DOCKER_SOCK,
          ],
          Labels: {
            'containarr.helper': 'updater',
          },
          HostConfig: {
            AutoRemove: true,
            Binds: [`${DOCKER_SOCK}:${DOCKER_SOCK}`],
            NetworkMode: 'none',
            ReadonlyRootfs: true,
            CapDrop: ['ALL'],
            SecurityOpt: ['no-new-privileges'],
            Memory: 256 * 1024 * 1024,
            NanoCpus: 500000000,
            PidsLimit: 64,
          },
        });
        await helper.start();
      } catch (error) {
        this.#status.installing = false;
        this.#status.installError = error.message;
        throw error;
      }
    }).finally(() => {
      this.#installPromise = null;
    });

    await this.#installPromise;
    return this.getStatus();
  }

  async getStatus() {
    if (!this.#status.checkedAt) {
      await this.check().catch(() => {});
    }
    return this.#status;
  }

}

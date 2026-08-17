import crypto from 'node:crypto';
import debug from 'debug';

import Settings from '../services/Settings.mjs';
import {
  CONTAINARR_DEMO_MODE,
  CONTAINARR_VERSION,
  DDNS_API_URL,
} from '../config.mjs';

const SYNC_INTERVAL = 1000 * 60 * 15; // 15 minutes

export default class DDNS {

  debug = debug('DDNS');

  #publicKey = null;
  #publicKeyBase64Url = null;
  #privateKey = null;
  #privateKeyBase64Url = null;
  #fingerprint = null;

  constructor() {
    this.client = Promise.resolve().then(async () => {
      let publicKeyBase64Url = await Settings.getSetting('ddns_public_key');
      let privateKeyBase64Url = await Settings.getSetting('ddns_private_key');

      // Generate new Keypair and Save
      if (!publicKeyBase64Url || !privateKeyBase64Url) {
        const keypair = crypto.generateKeyPairSync('ed25519');
        this.#publicKey = keypair.publicKey;
        this.#privateKey = keypair.privateKey;

        publicKeyBase64Url = this.#publicKey.export({
          type: 'spki',
          format: 'der',
        }).toString('base64url');
        privateKeyBase64Url = this.#privateKey.export({
          type: 'pkcs8',
          format: 'der',
        }).toString('base64url');

        await Settings.setSetting('ddns_public_key', publicKeyBase64Url);
        await Settings.setSetting('ddns_private_key', privateKeyBase64Url);
      }

      this.#publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyBase64Url, 'base64url'),
        type: 'spki',
        format: 'der',
      });
      this.#publicKeyBase64Url = publicKeyBase64Url;

      this.#privateKey = crypto.createPrivateKey({
        key: Buffer.from(privateKeyBase64Url, 'base64url'),
        type: 'pkcs8',
        format: 'der',
      });
      this.#privateKeyBase64Url = privateKeyBase64Url;

      this.#fingerprint = crypto.createHash('sha256')
        .update(this.#publicKey.export({
          type: 'spki',
          format: 'der',
        }))
        .digest('hex')
        .slice(0, 16);

      this.debug(`Public Key Fingerprint: ${this.#fingerprint}`);
    });

    this.client
      .then(() => this.debug('Ready'))
      .catch(err => this.debug(err));

    this.sync().catch(err => this.debug(`Error Syncing: ${err.message}`));

    this.syncInterval = setInterval(() => {
      this.sync().catch(err => this.debug(`Error Syncing: ${err.message}`));
    }, SYNC_INTERVAL);
  }

  async sync() {
    // Don't sync if the last sync was less than SYNC_INTERVAL ago
    const lastSyncAt = await Settings.getSetting('ddns_last_sync_at');
    if (lastSyncAt && (Date.now() - new Date(lastSyncAt).getTime()) < SYNC_INTERVAL) return;

    await this.client;

    const timestamp = Date.now();
    const signature = crypto.sign(null, Buffer.from(`${timestamp}`), {
      key: this.#privateKey,
    }).toString('base64url');

    const res = await fetch(`${DDNS_API_URL}/record`, {
      method: 'PUT',
      headers: {
        'User-Agent': `Containarr/v${CONTAINARR_VERSION}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signature,
        timestamp,
        publicKey: this.#publicKeyBase64Url,
      }),
    });

    const resJson = await res.json().catch(err => ({
      ok: false,
      error: err.message,
    }));

    if (resJson?.error) {
      throw new Error(`[HTTP ${res.status}] ${resJson.error}`);
    }

    await Settings.setSetting('ddns_last_sync_at', new Date());
    this.debug('Synced');
  }

  async getDomain() {
    return await this.getCustomDomain() || this.getGeneratedDomain();
  }

  async getCustomDomain() {
    return Settings.getSetting('ddns_domain');
  }

  async getGeneratedDomain() {
    await this.client;
    return `${this.#fingerprint}.containarr.me`;
  }

  async setDomain(domain) {
    const normalizedDomain = normalizeDomain(domain);
    await Settings.setSetting('ddns_domain', normalizedDomain);
    return this.getDomain();
  }

  async checkDomain(domain) {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      throw new TypeError('Enter a custom domain first.');
    }

    await this.client;
    if (CONTAINARR_DEMO_MODE) {
      const expectedTarget = await this.getGeneratedDomain();
      return {
        hostname: `containarr-check.${normalizedDomain}`,
        expectedTarget,
        dns: {
          configured: true,
          target: expectedTarget,
          error: null,
        },
        http: {
          reachable: true,
          statusCode: 200,
          error: null,
        },
        https: {
          reachable: true,
          statusCode: 200,
          error: null,
        },
      };
    }

    const timestamp = Date.now();
    const signature = crypto.sign(
      null,
      Buffer.from(`${timestamp}:${normalizedDomain}`),
      { key: this.#privateKey },
    ).toString('base64url');
    const response = await fetch(`${DDNS_API_URL}/domain/check`, {
      method: 'POST',
      headers: {
        'User-Agent': `Containarr/v${CONTAINARR_VERSION}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain: normalizedDomain,
        publicKey: this.#publicKeyBase64Url,
        signature,
        timestamp,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error) {
      throw new Error(result?.error || `[HTTP ${response.status}] Domain check failed.`);
    }

    return result;
  }

}

function normalizeDomain(domain) {
  if (domain === null || domain === '') return null;
  if (typeof domain !== 'string') {
    throw new TypeError('Domain must be a string.');
  }

  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, '');
  const labels = normalizedDomain.split('.');
  if (
    normalizedDomain.length > 253
    || labels.length < 2
    || labels.some(label => (
      label.length < 1
      || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    ))
  ) {
    throw new TypeError('Enter a valid domain without a protocol or wildcard.');
  }

  return normalizedDomain;
}

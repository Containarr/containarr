import crypto from 'node:crypto';
import debug from 'debug';

import Settings from '../services/Settings.mjs';
import {
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

    this.sync()
      .then(() => this.debug('Synced'))
      .catch(err => this.debug(`Error Syncing: ${err.message}`));

    this.syncInterval = setInterval(() => {
      this.sync()
        .then(() => this.debug('Synced'))
        .catch(err => this.debug(`Error Syncing: ${err.message}`));
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

    const res = await fetch(DDNS_API_URL, {
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
  }

  async getDomain() {
    const settingDomain = await Settings.getSetting('ddns_domain');
    if (settingDomain) return settingDomain;

    await this.client;
    return `${this.#fingerprint}.containarr.me`;
  }

}

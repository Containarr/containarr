import debug from 'debug';
import {
  Client,
  crypto as acmeCrypto,
} from 'acme-client';

import Apps from '../services/Apps.mjs';
import DDNS from '../services/DDNS.mjs';
import Proxies from '../services/Proxies.mjs';
import Settings from '../services/Settings.mjs';
import SQLite from '../services/SQLite.mjs';

import {
  CONTAINARR_DEMO_MODE,
  LETS_ENCRYPT_DIRECTORY_URL,
  LETS_ENCRYPT_EMAIL,
} from '../config.mjs';

const REFRESH_INTERVAL = 1000 * 60 * 5;
const RENEW_BEFORE = 1000 * 60 * 60 * 24 * 30;
const RETRY_INTERVAL = 1000 * 60 * 15;

export default class LetsEncrypt {

  debug = debug('LetsEncrypt');

  #challenges = new Map();
  #client = null;
  #provisionQueue = Promise.resolve();
  #provisioning = new Set();
  #refreshPromise = null;
  #refreshTimeout = null;

  constructor() {
    if (CONTAINARR_DEMO_MODE) {
      this.debug('Demo mode: certificate provisioning disabled');
      return;
    }

    this.refreshSoon(3000);
    this.refreshInterval = setInterval(() => {
      this.refresh().catch(error => this.debug(`Error Refreshing: ${error.message}`));
    }, REFRESH_INTERVAL);
  }

  getChallenge(token) {
    return this.#challenges.get(token)?.keyAuthorization ?? null;
  }

  async decorateResource(resource) {
    const resources = await this.decorateResources({ resource });
    return resources.resource;
  }

  async decorateResources(resources) {
    const domain = await DDNS.getDomain();
    const Certificate = CONTAINARR_DEMO_MODE
      ? null
      : await SQLite.getModelCertificate();
    const certificates = Certificate ? await Certificate.findAll() : [];
    const certificatesByHostname = new Map(
      certificates.map(certificate => [certificate.hostname, certificate]),
    );
    let missingCertificate = false;

    const decorated = Object.fromEntries(await Promise.all(Object.entries(resources).map(async ([id, resource]) => {
      const value = typeof resource?.toJSON === 'function'
        ? await resource.toJSON()
        : resource;
      const hostname = value.subdomain ? `${value.subdomain}.${domain}` : null;
      const required = this.requiresCertificate(value.tls);
      const certificate = hostname ? certificatesByHostname.get(hostname) : null;

      if (!CONTAINARR_DEMO_MODE && required && hostname && !certificate) {
        missingCertificate = true;
      }

      return [id, {
        ...value,
        certificate: required
          ? CONTAINARR_DEMO_MODE ? {
            hostname,
            status: 'ready',
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
            error: null,
          } : {
            hostname,
            status: certificate?.status ?? 'provisioning',
            expiresAt: certificate?.expiresAt ?? null,
            error: certificate?.error ?? null,
          }
          : {
            hostname,
            status: 'not_required',
            expiresAt: null,
            error: null,
          },
      }];
    })));

    if (missingCertificate) this.refreshSoon();
    return decorated;
  }

  async getTraefikCertificates() {
    const Certificate = await SQLite.getModelCertificate();
    const certificates = await Certificate.findAll();
    const now = Date.now();

    return certificates
      .filter(certificate => (
        certificate.certificate
        && certificate.privateKey
        && certificate.directoryUrl === LETS_ENCRYPT_DIRECTORY_URL
        && certificate.expiresAt
        && new Date(certificate.expiresAt).getTime() > now
      ))
      .map(certificate => ({
        certFile: certificate.certificate,
        keyFile: certificate.privateKey,
      }));
  }

  refreshSoon(delay = 1000) {
    if (CONTAINARR_DEMO_MODE) return;
    if (this.#refreshTimeout) return;
    this.#refreshTimeout = setTimeout(() => {
      this.#refreshTimeout = null;
      this.refresh().catch(error => this.debug(`Error Refreshing: ${error.message}`));
    }, delay);
  }

  refresh() {
    if (CONTAINARR_DEMO_MODE) return Promise.resolve();
    if (this.#refreshPromise) return this.#refreshPromise;

    this.#refreshPromise = this.#refresh().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  async #refresh() {
    const [domain, apps, proxies, Certificate] = await Promise.all([
      DDNS.getDomain(),
      Apps.getApps(),
      Proxies.getProxies(),
      SQLite.getModelCertificate(),
    ]);
    const hostnames = new Set([`containarr.${domain}`]);

    for (const resource of [
      ...Object.values(apps),
      ...Object.values(proxies),
    ]) {
      if (resource.subdomain && this.requiresCertificate(resource.tls)) {
        hostnames.add(`${resource.subdomain}.${domain}`);
      }
    }

    const certificates = await Certificate.findAll();
    const certificatesByHostname = new Map(
      certificates.map(certificate => [certificate.hostname, certificate]),
    );
    for (const certificate of certificates) {
      if (!hostnames.has(certificate.hostname)) {
        await certificate.destroy();
      }
    }

    for (const hostname of hostnames) {
      const certificate = certificatesByHostname.get(hostname)
        ?? await Certificate.create({ hostname, status: 'provisioning' });
      const expiresAt = certificate.expiresAt
        ? new Date(certificate.expiresAt).getTime()
        : 0;
      const retryAt = certificate.retryAt
        ? new Date(certificate.retryAt).getTime()
        : 0;
      const needsCertificate = (
        !certificate.certificate
        || !certificate.privateKey
        || certificate.directoryUrl !== LETS_ENCRYPT_DIRECTORY_URL
      );
      const needsRenewal = expiresAt <= Date.now() + RENEW_BEFORE;
      const canRetry = !retryAt || retryAt <= Date.now();

      if ((needsCertificate || needsRenewal) && canRetry) {
        this.#provision(certificate);
      }
    }
  }

  requiresCertificate(tls) {
    return (tls ?? 'only_https') !== 'only_http';
  }

  async retry(resource) {
    if (CONTAINARR_DEMO_MODE) return;
    if (!resource.subdomain || !this.requiresCertificate(resource.tls)) {
      throw new Error('This resource does not require a TLS certificate.');
    }

    const domain = await DDNS.getDomain();
    const hostname = `${resource.subdomain}.${domain}`;
    const Certificate = await SQLite.getModelCertificate();
    const certificate = await Certificate.findByPk(hostname)
      ?? await Certificate.create({ hostname });
    const renewing = Boolean(certificate.certificate && certificate.privateKey);

    certificate.status = renewing ? 'renewing' : 'provisioning';
    certificate.error = null;
    certificate.retryAt = null;
    await certificate.save();
    this.#provision(certificate);
  }

  async #getClient() {
    if (this.#client) return this.#client;

    this.#client = Promise.resolve().then(async () => {
      let accountKey = await Settings.getSetting('letsencrypt_account_key');
      if (!accountKey) {
        accountKey = (await acmeCrypto.createPrivateRsaKey()).toString();
        await Settings.setSetting('letsencrypt_account_key', accountKey);
      }

      return new Client({
        directoryUrl: LETS_ENCRYPT_DIRECTORY_URL,
        accountKey,
      });
    }).catch(error => {
      this.#client = null;
      throw error;
    });
    return this.#client;
  }

  #provision(certificate) {
    if (this.#provisioning.has(certificate.hostname)) return;
    this.#provisioning.add(certificate.hostname);

    this.#provisionQueue = this.#provisionQueue.catch(() => {}).then(async () => {
      const renewing = Boolean(certificate.certificate && certificate.privateKey);
      certificate.status = renewing ? 'renewing' : 'provisioning';
      certificate.error = null;
      certificate.retryAt = null;
      await certificate.save();

      this.debug(`${renewing ? 'Renewing' : 'Provisioning'} ${certificate.hostname}`);
      const client = await this.#getClient();
      const [privateKey, csr] = await acmeCrypto.createCsr({
        commonName: certificate.hostname,
        altNames: [certificate.hostname],
      });
      const certificatePem = await client.auto({
        csr,
        email: LETS_ENCRYPT_EMAIL,
        termsOfServiceAgreed: true,
        challengePriority: ['http-01'],
        skipChallengeVerification: true,
        challengeCreateFn: async (authorization, challenge, keyAuthorization) => {
          if (challenge.type !== 'http-01') {
            throw new Error(`Unsupported ACME challenge: ${challenge.type}`);
          }
          this.#challenges.set(challenge.token, {
            hostname: certificate.hostname,
            keyAuthorization,
          });
        },
        challengeRemoveFn: async (authorization, challenge) => {
          this.#challenges.delete(challenge.token);
        },
      });
      const certificateInfo = acmeCrypto.readCertificateInfo(certificatePem);

      certificate.status = 'ready';
      certificate.certificate = certificatePem;
      certificate.privateKey = privateKey.toString();
      certificate.directoryUrl = LETS_ENCRYPT_DIRECTORY_URL;
      certificate.expiresAt = certificateInfo.notAfter;
      certificate.retryAt = null;
      certificate.error = null;
      await certificate.save();
      this.debug(`Ready ${certificate.hostname}, expires ${certificateInfo.notAfter.toISOString()}`);
    }).catch(async error => {
      certificate.status = 'error';
      certificate.error = error.message;
      certificate.retryAt = new Date(Date.now() + RETRY_INTERVAL);
      await certificate.save().catch(saveError => this.debug(saveError));
      this.debug(`Error Provisioning ${certificate.hostname}: ${error.message}`);
    }).finally(() => {
      for (const [token, challenge] of this.#challenges) {
        if (challenge.hostname === certificate.hostname) {
          this.#challenges.delete(token);
        }
      }
      this.#provisioning.delete(certificate.hostname);
    });
  }
}

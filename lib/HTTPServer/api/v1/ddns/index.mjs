import express from 'express';
import DDNS from '../../../../../services/DDNS.mjs';
import Docker from '../../../../../services/Docker.mjs';
import Backups from '../../../../../services/Backups.mjs';
import LetsEncrypt from '../../../../../services/LetsEncrypt.mjs';
import { PORT_HTTP, PORT_HTTPS } from '../../../../../config.mjs';

export default express()

  // getDomain
  .get('/domain', async (req, res) => {
    res.status(200).json(await getDomainSettings());
  })

  // setDomain
  .put('/domain', async (req, res) => {
    try {
      await DDNS.setDomain(req.body?.domain);
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    LetsEncrypt.refreshSoon();
    Backups.backupSoon();
    res.status(200).json(await getDomainSettings());
  })

  // checkDomain
  .post('/domain/check', async (req, res) => {
    try {
      res.status(200).json(await DDNS.checkDomain(req.body?.domain));
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(502).json({ error: error.message });
    }
  });

async function getDomainSettings() {
  const [domain, customDomain, generatedDomain, containers, currentContainer, hostIpAddresses] = await Promise.all([
    DDNS.getDomain(),
    DDNS.getCustomDomain(),
    DDNS.getGeneratedDomain(),
    Docker.getContainers(),
    Docker.getCurrentContainerMetadata().catch(() => null),
    Docker.getHostIpAddresses().catch(() => []),
  ]);

  const container = containers.find(({ Id }) => Id === currentContainer?.Id);
  const httpPort = container?.Ports?.find(({ PrivatePort, Type }) => (
    PrivatePort === Number(PORT_HTTP) && Type === 'tcp'
  ))?.PublicPort ?? Number(PORT_HTTP);
  const httpsPort = container?.Ports?.find(({ PrivatePort, Type }) => (
    PrivatePort === Number(PORT_HTTPS) && Type === 'tcp'
  ))?.PublicPort ?? Number(PORT_HTTPS);
  const installationIp = hostIpAddresses.find(address => (
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address)
  )) ?? null;

  return {
    domain,
    customDomain,
    generatedDomain,
    httpPort,
    httpsPort,
    installationIp,
  };
}

import net from 'node:net';
import fs from 'node:fs/promises';
import express from 'express';
import Traefik from '../../../../../services/Traefik.mjs';
import Firewall from '../../../../../services/Firewall.mjs';

export default express()

  // getTraefikConfig
  .get('/config', async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return res.status(404).send();
    }
    const traefikConfig = await Traefik.getConfig();
    res.json(traefikConfig);
  })

  // authorizePolicy
  .get('/firewall/:policyId', async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return res.status(404).send();
    }
    const allowed = await Firewall.isAllowed({
      policyId: req.params.policyId,
      address: req.get('x-forwarded-for'),
    });
    if (allowed) return res.status(204).send();

    let address = req.get('x-forwarded-for')?.split(',')[0].trim()
      || req.get('x-real-ip')
      || 'unknown';
    if (address.startsWith('::ffff:')) address = address.slice(7);
    if (!net.isIP(address)) address = 'unknown';

    res.type('html').status(403).send(
      (await fs.readFile(
        new URL('../../../static/403.html', import.meta.url),
        'utf8',
      )).replace('{{REQUESTER_IP}}', address),
    );
  });

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
    res.status(allowed ? 204 : 401).send();
  });

import express from 'express';

import Firewall from '../../../../../services/Firewall.mjs';
import Backups from '../../../../../services/Backups.mjs';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  .get('/suggestions', async (req, res) => {
    let addresses = [];
    try {
      addresses = await Docker.getHostIpAddresses();
    } catch {
      // The unrestricted IPv4 range remains useful if host detection fails.
    }

    const suggestions = [
      '0.0.0.0/0',
      ...addresses
        .filter(address => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address))
        .map(address => `${address.split('.').slice(0, 2).join('.')}.0.0/16`),
    ];

    res.status(200).json([...new Set(suggestions)]);
  })

  .get('/policy', async (req, res) => {
    res.status(200).json(await Firewall.getPolicies());
  })

  .post('/policy', async (req, res) => {
    try {
      const policy = await Firewall.createPolicy({
        name: req.body?.name,
        allowedIps: req.body?.allowedIps,
      });
      Backups.backupSoon();
      res.status(201).json(policy);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })

  .put('/policy/:policyId', async (req, res) => {
    try {
      const policy = await Firewall.updatePolicy({
        policyId: req.params.policyId,
        name: req.body?.name,
        allowedIps: req.body?.allowedIps,
      });
      Backups.backupSoon();
      res.status(200).json(policy);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })

  .delete('/policy/:policyId', async (req, res) => {
    try {
      await Firewall.deletePolicy({ policyId: req.params.policyId });
      Backups.backupSoon();
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

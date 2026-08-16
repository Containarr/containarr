import express from 'express';

import Firewall from '../../../../../services/Firewall.mjs';
import Backups from '../../../../../services/Backups.mjs';

export default express()

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

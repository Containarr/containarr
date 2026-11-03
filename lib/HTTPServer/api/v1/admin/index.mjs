import express from 'express';
import DDNS from '../../../../../services/DDNS.mjs';
import Settings from '../../../../../services/Settings.mjs';
import Firewall from '../../../../../services/Firewall.mjs';

export default express()
  .get('/', async (req, res) => {
    res.json({
      url: `https://containarr.${await DDNS.getDomain()}`,
      policyId: await Settings.getSetting('adminPolicyId') || 'public',
    });
  })
  .put('/', async (req, res) => {
    const policyId = req.body?.policyId;
    if (typeof policyId !== 'string') return res.status(400).json({ error: 'Select a firewall policy.' });
    try {
      await Firewall.getPolicy({ policyId });
    } catch {
      return res.status(400).json({ error: 'Firewall policy not found.' });
    }
    await Settings.setSetting('adminPolicyId', policyId);
    res.json({ url: `https://containarr.${await DDNS.getDomain()}`, policyId });
  });

import express from 'express';
import DDNS from '../../../../../services/DDNS.mjs';
import LetsEncrypt from '../../../../../services/LetsEncrypt.mjs';

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
  const [domain, customDomain, generatedDomain] = await Promise.all([
    DDNS.getDomain(),
    DDNS.getCustomDomain(),
    DDNS.getGeneratedDomain(),
  ]);

  return { domain, customDomain, generatedDomain };
}

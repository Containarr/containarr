import express from 'express';
import { ECDH } from 'node:crypto';

import Events from '../../../../../services/Events.mjs';

export default express()
  .use(async (req, res, next) => {
    await Events.ready;
    next();
  })
  .get('/', async (req, res) => {
    const page = Number(req.query.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
      return res.status(400).json({ error: 'Invalid page.' });
    }
    res.json(await Events.list({ page, sortBy: req.query.sortBy, direction: req.query.direction, dev: req.query.dev === '1' }));
  })
  .post('/debug', async (req, res) => {
    if (req.query.dev !== '1') return res.status(404).json({ error: 'Debug events are not enabled.' });
    res.status(201).json(await Events.createDebugEvent(req.body?.eventName));
  })
  .get('/destinations', async (req, res) => {
    res.json({
      publicKey: Events.vapidDetails.publicKey,
      devices: await Events.PushDevice.findAll({
        attributes: ['id', 'name', 'createdAt', 'lastSentAt', 'lastError'], order: [['createdAt', 'ASC']],
      }),
      webhooks: await Events.Webhook.findAll({ order: [['createdAt', 'ASC']] }),
    });
  })
  .post('/device', async (req, res) => {
    const { name, subscription } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Device name must contain 1–100 characters.' });
    }
    try {
      const endpoint = new URL(subscription?.endpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash
        || subscription.endpoint.length > 4096) throw new Error();
      const { auth, p256dh } = subscription.keys ?? {};
      if (typeof auth !== 'string' || !/^[\w-]{22}(==)?$/.test(auth)
        || Buffer.from(auth, 'base64url').length !== 16
        || typeof p256dh !== 'string' || !/^[\w-]{87}=?$/.test(p256dh)
        || Buffer.from(p256dh, 'base64url').length !== 65) throw new Error();
      ECDH.convertKey(Buffer.from(p256dh, 'base64url'), 'prime256v1');
    } catch {
      return res.status(400).json({ error: 'Invalid push subscription.' });
    }
    const [device] = await Events.PushDevice.findOrCreate({
      where: { endpoint: subscription.endpoint },
      defaults: { name: name.trim(), subscription },
    });
    await device.update({
      name: name.trim(),
      subscription: { endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh } },
      lastError: null,
    });
    res.status(201).json({ id: device.id, name: device.name });
  })
  .post('/device/:id/test', async (req, res) => {
    await Events.sendTest({ kind: 'device', id: req.params.id });
    res.sendStatus(204);
  })
  .patch('/device/:id', async (req, res) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Device name must contain 1–100 characters.' });
    }
    const device = await Events.PushDevice.findByPk(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found.' });
    await device.update({ name: name.trim() });
    res.sendStatus(204);
  })
  .delete('/device/:id', async (req, res) => {
    await Events.PushDevice.destroy({ where: { id: req.params.id } });
    res.sendStatus(204);
  })
  .post('/webhook', async (req, res) => {
    const { name, url } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Webhook name must contain 1–100 characters.' });
    }
    try {
      if (typeof url !== 'string' || url.length > 4096) throw new Error();
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Enter an HTTP or HTTPS URL without embedded credentials or a fragment.' });
    }
    const webhook = await Events.Webhook.create({ name: name.trim(), url: new URL(url).href });
    res.status(201).json(webhook);
  })
  .post('/webhook/:id/test', async (req, res) => {
    await Events.sendTest({ kind: 'webhook', id: req.params.id });
    res.sendStatus(204);
  })
  .patch('/webhook/:id', async (req, res) => {
    const { name, url } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Webhook name must contain 1–100 characters.' });
    }
    try {
      if (typeof url !== 'string' || url.length > 4096) throw new Error();
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Enter an HTTP or HTTPS URL without embedded credentials or a fragment.' });
    }
    const webhook = await Events.Webhook.findByPk(req.params.id);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found.' });
    await webhook.update({ name: name.trim(), url: new URL(url).href, lastError: null });
    res.sendStatus(204);
  })
  .delete('/webhook/:id', async (req, res) => {
    await Events.Webhook.destroy({ where: { id: req.params.id } });
    res.sendStatus(204);
  })
  .delete('/:id', async (req, res) => {
    await Events.Event.destroy({ where: { id: req.params.id } });
    res.sendStatus(204);
  });

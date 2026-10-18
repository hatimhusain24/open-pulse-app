// Saves (POST) or removes (DELETE) one browser's push subscription and its alert rules.
import { redis, hasStore, subId, validSubscription, cleanRules, readBody } from './_lib.js';

const MAX_SUBSCRIBERS = 5000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasStore()) return res.status(503).json({ error: 'Alert storage is not set up on this server.' });
  const body = readBody(req);
  try {
    if (req.method === 'POST') {
      const s = body.subscription;
      if (!validSubscription(s)) return res.status(400).json({ error: 'That is not a valid push subscription.' });
      const id = subId(s.endpoint);
      const known = await redis('SISMEMBER', 'subs', id);
      if (!known && (await redis('SCARD', 'subs')) >= MAX_SUBSCRIBERS) return res.status(503).json({ error: 'The alert list is full right now.' });
      const record = { subscription: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, rules: cleanRules(body.rules), updated: Date.now() };
      await redis('SET', 'sub:' + id, JSON.stringify(record));
      await redis('SADD', 'subs', id);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (typeof body.endpoint !== 'string' || body.endpoint.length > 1000) return res.status(400).json({ error: 'Missing subscription endpoint.' });
      const id = subId(body.endpoint);
      await redis('SREM', 'subs', id);
      await redis('DEL', 'sub:' + id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Use POST to subscribe or DELETE to unsubscribe.' });
  } catch (err) {
    console.error('subscribe failed', err);
    return res.status(500).json({ error: 'The alert server could not save that. Try again later.' });
  }
}

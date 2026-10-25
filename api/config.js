// Tells the page whether background alerts are available here, and the public key browsers need to subscribe.
import { hasStore } from './_lib.js';

export default function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  res.setHeader('Cache-Control', 'no-store');
  // Setup check: names (never values) of storage-related settings this deployment can see.
  const storageVars = Object.keys(process.env).filter(k => /KV|REDIS|UPSTASH/.test(k)).sort();
  res.status(200).json({ push: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && hasStore()), publicKey, storage: hasStore(), storageVars });
}

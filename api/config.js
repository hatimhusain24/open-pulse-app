// Tells the page whether background alerts are available here, and the public key browsers need to subscribe.
import { hasStore } from './_lib.js';

export default function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ push: Boolean(publicKey && process.env.VAPID_PRIVATE_KEY && hasStore()), publicKey });
}

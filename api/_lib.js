// Shared helpers for the alert server. Files starting with "_" are not exposed as routes on Vercel.
import { createHash } from 'node:crypto';

export const fin = n => n !== null && n !== undefined && n !== '' && Number.isFinite(+n);

const storeUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const storeToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasStore = () => Boolean(storeUrl() && storeToken());

// One Redis command over Upstash's REST API, e.g. redis('SADD', 'subs', id).
export async function redis(...cmd) {
  if (!hasStore()) throw new Error('Alert storage is not configured');
  const r = await fetch(storeUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${storeToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Storage answered HTTP ${r.status}`);
  return j.result;
}

export async function getJSON(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'open-pulse-alerts' } });
    if (!r.ok) throw new Error(`${new URL(url).host} answered HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export const subId = endpoint => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

// Only real browser push services, so the server never sends requests anywhere else.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
export function validSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return false;
  let u; try { u = new URL(s.endpoint); } catch { return false; }
  return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && s.keys
    && typeof s.keys.p256dh === 'string' && s.keys.p256dh.length < 200
    && typeof s.keys.auth === 'string' && s.keys.auth.length < 100;
}

const clamp = (v, lo, hi, d) => (fin(v) ? Math.min(hi, Math.max(lo, +v)) : d);
export function cleanRules(r = {}) {
  const a = r.aqi || {}, q = r.quake || {}, c = r.coin || {}, p = a.place || {};
  const place = fin(p.lat) && fin(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
    ? { name: String(p.name || 'Your place').slice(0, 80), lat: +(+p.lat).toFixed(4), lon: +(+p.lon).toFixed(4) } : null;
  return {
    aqi: { on: Boolean(a.on) && Boolean(place), above: Math.round(clamp(a.above, 1, 500, 150)), place },
    quake: { on: Boolean(q.on), min: clamp(q.min, 4.5, 9.5, 6) },
    coin: { on: Boolean(c.on), pct: clamp(c.pct, 1, 90, 5), id: typeof c.id === 'string' && /^[a-z0-9-]{1,64}$/.test(c.id) ? c.id : 'bitcoin' }
  };
}

export function aqiLabel(v) {
  v = Math.round(v);
  if (v <= 50) return 'Good'; if (v <= 100) return 'Moderate'; if (v <= 150) return 'Unhealthy for sensitive groups';
  if (v <= 200) return 'Unhealthy'; if (v <= 300) return 'Very unhealthy'; return 'Hazardous';
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

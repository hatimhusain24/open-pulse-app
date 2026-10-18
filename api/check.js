// Runs on a schedule: fetches the latest air quality, earthquakes and coin prices, compares them with
// every subscriber's rules, and sends a push notification once per event.
// Called by the GitHub Actions workflow every 10 minutes and by Vercel Cron once a day,
// both with "Authorization: Bearer <CRON_SECRET>".
import webpush from 'web-push';
import { redis, hasStore, getJSON, fin, aqiLabel } from './_lib.js';

const SEEN_TTL = 2 * 24 * 3600; // seconds an event is remembered, so it alerts only once
const placeKey = p => `${(+p.lat).toFixed(2)},${(+p.lon).toFixed(2)}`;
const titleCase = id => id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

async function airByPlace(places) {
  const out = {};
  for (let i = 0; i < places.length; i += 100) {
    const chunk = places.slice(i, i + 100);
    const d = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${chunk.map(p => p.lat).join(',')}&longitude=${chunk.map(p => p.lon).join(',')}&current=us_aqi`).catch(() => null);
    const list = Array.isArray(d) ? d : d ? [d] : [];
    chunk.forEach((p, k) => { const v = list[k] && list[k].current && list[k].current.us_aqi; if (fin(v)) out[placeKey(p)] = +v; });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasStore() || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Alerts are not configured on this server.' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alerts@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const ids = (await redis('SMEMBERS', 'subs')) || [];
  if (!ids.length) return res.status(200).json({ subscribers: 0, sent: 0, removed: 0 });
  const raw = await redis('MGET', ...ids.map(id => 'sub:' + id));
  const subs = ids.map((id, k) => { try { return { id, ...JSON.parse(raw[k]) }; } catch { return null; } }).filter(s => s && s.subscription && s.rules);

  const coins = [...new Set(subs.filter(s => s.rules.coin.on).map(s => s.rules.coin.id))];
  const places = [...new Map(subs.filter(s => s.rules.aqi.on && s.rules.aqi.place).map(s => [placeKey(s.rules.aqi.place), s.rules.aqi.place])).values()];
  const [quakes, prices, air] = await Promise.all([
    subs.some(s => s.rules.quake.on) ? getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson').catch(() => null) : null,
    coins.length ? getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.map(encodeURIComponent).join(',')}&vs_currencies=usd&include_24hr_change=true`).catch(() => null) : null,
    places.length ? airByPlace(places) : {}
  ]);

  const day = new Date().toISOString().slice(0, 10);
  let sent = 0, removed = 0;
  for (const s of subs) {
    const R = s.rules, events = [];
    if (R.aqi.on && R.aqi.place) {
      const v = air[placeKey(R.aqi.place)];
      if (fin(v) && v >= R.aqi.above) events.push({ key: `aqi:${placeKey(R.aqi.place)}:${day}:${R.aqi.above}`, title: `Air quality alert · ${R.aqi.place.name}`, body: `US AQI is ${Math.round(v)} (${aqiLabel(v)}), at or above your limit of ${R.aqi.above}.`, url: './#air' });
    }
    if (R.quake.on && quakes && Array.isArray(quakes.features)) {
      quakes.features.forEach(q => {
        const m = q.properties && q.properties.mag, m1 = Math.round(m * 10) / 10;
        if (fin(m) && m1 >= R.quake.min && Date.now() - q.properties.time < 6 * 3600e3) events.push({ key: 'q:' + q.id, title: `Earthquake M${m1.toFixed(1)}`, body: q.properties.place || 'Unknown place', url: './#earth' });
      });
    }
    if (R.coin.on && prices && prices[R.coin.id]) {
      const p = prices[R.coin.id].usd_24h_change, usd = prices[R.coin.id].usd, name = titleCase(R.coin.id);
      if (fin(p) && Math.abs(p) >= R.coin.pct) events.push({ key: `c:${R.coin.id}:${day}:${p > 0 ? 'up' : 'down'}`, title: `${name} ${p > 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(1)}%`, body: `${name} is $${(+usd).toLocaleString('en-US', { maximumFractionDigits: usd < 1 ? 6 : 2 })}, ${p > 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(1)}% in 24 hours.`, url: './#markets' });
    }
    for (const e of events.slice(0, 5)) {
      const seenKey = `seen:${s.id}:${e.key}`;
      if ((await redis('SET', seenKey, '1', 'NX', 'EX', SEEN_TTL)) !== 'OK') continue; // already alerted
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify({ title: e.title, body: e.body, url: e.url, tag: e.key }), { TTL: 3600 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) { // the browser unsubscribed: forget it
          await redis('SREM', 'subs', s.id); await redis('DEL', 'sub:' + s.id); removed++; break;
        }
        await redis('DEL', seenKey); // try again on the next run
        console.error('push failed', err.statusCode, err.body);
      }
    }
  }
  return res.status(200).json({ subscribers: subs.length, sent, removed });
}

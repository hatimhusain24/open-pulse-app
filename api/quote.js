// Market prices and history from Yahoo Finance's public chart endpoint.
// Browsers can't call it directly (no CORS headers), so this function relays a trimmed copy.
//   /api/quote?s=GC%3DF&range=1d&interval=5m            one symbol, history
//   /api/quote?s=GC%3DF&p1=1700000000&p2=1710000000&interval=1h
//   /api/quote?list=GC%3DF,SI%3DF                        latest price + 5-day sparkline for several symbols
const SYM = /^[A-Za-z0-9=^.\-]{1,16}$/;
const RANGE = /^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$/;
const INTERVAL = /^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo|3mo)$/;
const UA = 'Mozilla/5.0 (compatible; OpenPulse/1.0)';

async function chart(sym, qs) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${qs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Yahoo Finance answered HTTP ${r.status}`);
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || 'No data for this symbol');
  const m = res.meta || {}, q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const t = [], c = [], o = [], h = [], l = [], n = x => (typeof x === 'number' && isFinite(x) ? +x.toPrecision(8) : null);
  (res.timestamp || []).forEach((ts, i) => {
    const v = q.close && q.close[i]; if (typeof v !== 'number' || !isFinite(v)) return;
    t.push(ts * 1000); c.push(+v.toPrecision(8));
    o.push(n(q.open && q.open[i]) ?? v); h.push(n(q.high && q.high[i]) ?? v); l.push(n(q.low && q.low[i]) ?? v);
  });
  return {
    sym, name: m.shortName || m.longName || sym, exch: m.fullExchangeName || m.exchangeName || '', cur: m.currency || 'USD',
    price: m.regularMarketPrice, prev: m.chartPreviousClose, hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow,
    hi52: m.fiftyTwoWeekHigh, lo52: m.fiftyTwoWeekLow, time: m.regularMarketTime ? m.regularMarketTime * 1000 : null, t, c, o, h, l
  };
}

export default async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    if (q.list) {
      const syms = String(q.list).split(',').filter(s => SYM.test(s)).slice(0, 12);
      if (!syms.length) return res.status(400).json({ error: 'No valid symbols' });
      const out = await Promise.all(syms.map(async s => {
        try {
          const [d, w] = await Promise.all([chart(s, 'range=1d&interval=1d'), chart(s, 'range=5d&interval=60m')]);
          return { ...d, spark: w.c.filter((_, i) => i % 2 === 0), t: undefined, c: undefined, o: undefined, h: undefined, l: undefined };
        } catch (e) { return { sym: s, error: e.message }; }
      }));
      return res.status(200).json({ list: out });
    }
    const s = String(q.s || '');
    if (!SYM.test(s)) return res.status(400).json({ error: 'Invalid symbol' });
    const interval = String(q.interval || '1d');
    if (!INTERVAL.test(interval)) return res.status(400).json({ error: 'Invalid interval' });
    let qs;
    if (q.range) { if (!RANGE.test(String(q.range))) return res.status(400).json({ error: 'Invalid range' }); qs = `range=${q.range}&interval=${interval}`; }
    else {
      const p1 = Math.floor(+q.p1), p2 = Math.floor(+q.p2);
      if (!isFinite(p1) || !isFinite(p2) || p1 <= 0 || p2 <= p1) return res.status(400).json({ error: 'Invalid period' });
      qs = `period1=${p1}&period2=${p2}&interval=${interval}`;
    }
    return res.status(200).json(await chart(s, qs));
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Upstream error' });
  }
}

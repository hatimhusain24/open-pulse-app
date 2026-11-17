// Local preview: serves the site and the /api/quote relay. Run with `node dev-server.mjs` (port 8765).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import quote from './api/quote.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/quote') {
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    req.query = Object.fromEntries(url.searchParams);
    return quote(req, res);
  }
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = normalize(join(root, rel));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(8765, () => console.log('Open Pulse at http://localhost:8765'));

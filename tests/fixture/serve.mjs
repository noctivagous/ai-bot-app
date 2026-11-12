// Tiny static server for the muse.ai fixture page (slice 3+).
// Usage: node tests/fixture/serve.mjs [port]   (default 7790, MD_FIXTURE_PORT)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MD_FIXTURE_PORT ?? process.argv[2] ?? 7790);
const HTML = fs.readFileSync(path.join(HERE, 'muse-fixture.html'));

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/fixture' || url.pathname === '/fixture.html' || url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(HTML);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[fixture] serving muse-fixture.html at http://127.0.0.1:${PORT}/fixture`);
  });

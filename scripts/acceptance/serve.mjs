// Tiny static server for a built folder: node serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
const [dir, port = '4398'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(dir, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { /* fall through */ }
  try {
    let b = await readFile(f); const h = { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=300' };
    if (/html|css|javascript|json|svg|xml|text/.test(h['content-type']) && /gzip/.test(req.headers['accept-encoding'] || '')) { b = gzipSync(b); h['content-encoding'] = 'gzip'; }
    res.writeHead(200, h); res.end(b);
  }
  catch { try { const b = await readFile(join(dir, '404.html')); res.writeHead(404, { 'content-type': 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end('nf'); } }
}).listen(+port, () => console.log('serving', dir, port));

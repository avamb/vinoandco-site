// Tiny static server for a built folder: node serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
const [dir, port = '4398'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(dir, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { /* fall through */ }
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch { try { const b = await readFile(join(dir, '404.html')); res.writeHead(404, { 'content-type': 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end('nf'); } }
}).listen(+port, () => console.log('serving', dir, port));

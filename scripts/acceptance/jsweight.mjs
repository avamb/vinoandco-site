// JS transferred before the purchase modal opens (encoded bytes from the network log): node jsweight.mjs <origin>
import { chromium } from '@playwright/test';
const origin = process.argv[2];
const b = await chromium.launch();
for (const path of ['/', '/event/e33/']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await c.addCookies([{ name: 'age_gate', value: '1', domain: new URL(origin).hostname, path: '/' }]);
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p); await cdp.send('Network.enable');
  const reqs = new Map(); let total = 0; const rows = [];
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, e.request.url));
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (e.type === 'Script') rows.push({ id: e.requestId, url: r }); });
  const sizes = new Map();
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
  await p.goto(origin + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  const sum = rows.reduce((s, r) => s + (sizes.get(r.id) || 0), 0);
  const own = rows.filter((r) => r.url.startsWith(origin)).reduce((s, r) => s + (sizes.get(r.id) || 0), 0);
  console.log(`${origin}${path}: scripts ${rows.length}, all ${(sum / 1024).toFixed(1)} KB encoded, same-origin ${(own / 1024).toFixed(1)} KB;`, rows.map((r) => r.url.replace(origin, '').slice(0, 40) + ' ' + ((sizes.get(r.id) || 0) / 1024).toFixed(1)).join(' | ').slice(0, 400));
  await c.close();
}
await b.close();

// node montage.mjs <shotsdir> <outdir> <key> <vp> <lang> [scale] [seg]
import sharp from 'sharp';
const [dir, outd, key, vp, lang, scaleS = '0.5', segS = '1800'] = process.argv.slice(2);
const scale = +scaleS, seg = +segS;
const a = `${dir}/${key}-new-${vp}-${lang}.png`, w = `${dir}/${key}-wp-${vp}-${lang}.png`;
const load = async (f) => { const im = sharp(f); const m = await im.metadata(); return { im, w: m.width, h: m.height }; };
const A = await load(a), W = await load(w).catch(() => null);
console.log(key, vp, lang, 'new', A.w, A.h, 'wp', W?.w, W?.h);
const H = Math.max(A.h, W?.h ?? 0);
const n = Math.ceil(H / seg);
for (let i = 0; i < n; i++) {
  const top = i * seg;
  const part = async (X) => {
    if (!X || top >= X.h) return sharp({ create: { width: Math.round(A.w * scale), height: Math.round(Math.min(seg, H - top) * scale), channels: 3, background: '#fff' } }).png().toBuffer();
    const hh = Math.min(seg, X.h - top);
    return sharp(a === X.f ? a : X.f).extract({ left: 0, top, width: X.w, height: hh }).resize({ width: Math.round(X.w * scale) }).png().toBuffer();
  };
  A.f = a; if (W) W.f = w;
  const pa = await part(A), pw = await part(W);
  const ma = await sharp(pa).metadata(), mw = await sharp(pw).metadata();
  const h = Math.max(ma.height, mw.height);
  await sharp({ create: { width: ma.width + mw.width + 6, height: h, channels: 3, background: '#0f0' } })
    .composite([{ input: pa, left: 0, top: 0 }, { input: pw, left: ma.width + 6, top: 0 }]).png().toFile(`${outd}/${key}-${vp}-${lang}-${i}.png`);
}

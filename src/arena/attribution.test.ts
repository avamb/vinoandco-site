import { describe, it, expect } from 'vitest';
import { captureAttribution, readAttribution, clearLongAttribution, ATTRIBUTION_KEY } from './attribution.ts';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}
const t0 = new Date('2026-11-01T10:00:00Z');

describe('long-lived attribution', () => {
  it('a new tab reads the localStorage copy without expires_at', () => {
    const local = mem();
    captureAttribution(new URL('https://x/?utm_source=fb&sl=r1'), mem(), t0, ATTRIBUTION_KEY, { store: local, allowed: true });
    const a = readAttribution(mem(), local, new Date('2026-11-10T10:00:00Z'))!;
    expect(a.utm_source).toBe('fb');
    expect(a.ref).toBe('r1');
    expect(Object.keys(a)).not.toContain('expires_at');
  });
  it('expires after 30 days and is removed', () => {
    const local = mem();
    captureAttribution(new URL('https://x/?utm_source=fb'), mem(), t0, ATTRIBUTION_KEY, { store: local, allowed: true });
    expect(readAttribution(mem(), local, new Date('2026-12-01T09:00:00Z'))).not.toBeNull();
    expect(readAttribution(mem(), local, new Date('2026-12-01T10:00:01Z'))).toBeNull();
    expect(local.m.has(ATTRIBUTION_KEY)).toBe(false);
  });
  it('fbclid without labels becomes facebook/fbclid', () => {
    const a = captureAttribution(new URL('https://x/?fbclid=abc'), mem(), t0)!;
    expect(a.utm_source).toBe('facebook');
    expect(a.utm_medium).toBe('fbclid');
  });
  it('utm labels win over fbclid', () => {
    const a = captureAttribution(new URL('https://x/?fbclid=abc&utm_source=newsletter'), mem(), t0)!;
    expect(a.utm_source).toBe('newsletter');
    expect(a.utm_medium).toBeUndefined();
  });
  it('declined: no localStorage write; clear removes it', () => {
    const local = mem();
    captureAttribution(new URL('https://x/?utm_source=fb'), mem(), t0, ATTRIBUTION_KEY, { store: local, allowed: false });
    expect(local.m.size).toBe(0);
    local.setItem(ATTRIBUTION_KEY, '{}');
    clearLongAttribution(local);
    expect(local.m.size).toBe(0);
  });
});

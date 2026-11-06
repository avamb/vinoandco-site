// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import MyTickets from './MyTickets.svelte';
import ru from '../../i18n/ru.json';
import { LINK_TOKEN_KEY, SESSION_KEY, takeLinkToken, ticketFileName } from '../../lib/my-tickets.ts';

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
let calls: Call[];
let routes: Record<string, (c: Call) => Response>;
let component: ReturnType<typeof mount> | null = null;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const session = { session_token: 'sess-1', expires_at: '2099-01-01T00:00:00Z' };
const order = (over: Record<string, unknown> = {}) => ({
  order_id: 'o1',
  order_number: 1000123,
  status: 'paid',
  total: 29000,
  currency: 'ILS',
  created_at: '2026-11-01T10:00:00Z',
  session_cancelled: false,
  event: { event_id: 'e1', session_id: 's1', name: 'Премьера вина', slug: 'premera', start_at: '2026-11-21T17:30:00Z', venue_name: 'Винотека', timezone: 'Asia/Jerusalem' },
  tickets: [{ ticket_id: 'tk1', status: 'active', tier_name: 'Стандарт', human_code: 'AB12', pdf_url: 'https://api.test/v1/public/my-tickets/orders/o1/tickets/tk1/pdf' }],
  ...over,
});
const page = (orders: unknown[], p = 1, total = 1) => ({ orders, pagination: { page: p, per_page: 20, total: orders.length, total_pages: total } });

beforeEach(() => {
  calls = [];
  routes = {};
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const c: Call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    for (const [part, fn] of Object.entries(routes)) if (url.includes(part)) return fn(c);
    throw new Error(`unexpected ${url}`);
  });
});
afterEach(() => {
  if (component) unmount(component);
  component = null;
  vi.unstubAllGlobals();
});

function start(query = '') {
  history.replaceState(null, '', `/my-tickets/${query}`);
  component = mount(MyTickets as unknown as Component<Record<string, unknown>>, {
    target: document.getElementById('root')!,
    props: { t: ru.myTickets, apiBase: 'https://api.test', feedToken: 'tok', lang: 'ru', intl: 'ru-RU', pageUrl: 'https://vinoandco.events/my-tickets/', upcomingPath: '/upcoming-events/' },
  });
  flushSync();
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};
const text = () => document.getElementById('root')!.textContent!.replace(/\s+/g, ' ');
const click = (sel: string) => {
  document.querySelector<HTMLElement>(sel)!.click();
  flushSync();
};

describe('token handling', () => {
  it('keeps the link token in the tab and takes it out of the address', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(takeLinkToken('https://x/my-tickets/?t=abc&x=1#h', s)).toEqual({ token: 'abc', cleanUrl: '/my-tickets/?x=1#h' });
    expect(m.get(LINK_TOKEN_KEY)).toBe('abc');
    expect(takeLinkToken('https://x/my-tickets/', s)).toEqual({ token: 'abc', cleanUrl: null });
  });
  it('names the downloaded file safely', () => {
    expect(ticketFileName(1000123, 'AB 12/x', 0)).toBe('vinoandco-1000123-AB12x.pdf');
    expect(ticketFileName(1000123, null, 1)).toBe('vinoandco-1000123-2.pdf');
  });
});

describe('MyTickets', () => {
  it('asks the platform for a link and always answers "check your e-mail"', async () => {
    routes['/my-tickets/link'] = () => json({ status: 'check_email' }, 202);
    start();
    const input = document.querySelector<HTMLInputElement>('#vc-mt-email')!;
    input.value = 'anna@example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    const c = calls[0];
    expect(c.url).toBe('https://api.test/v1/public/feeds/tok/my-tickets/link');
    expect(c.body).toEqual({ email: 'anna@example.com', locale: 'ru', page_url: 'https://vinoandco.events/my-tickets/' });
    expect(text()).toContain('Проверьте почту');
  });

  it('does not send a malformed address', async () => {
    start();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(calls).toHaveLength(0);
    expect(text()).toContain('Введите корректный e-mail.');
  });

  it('opening the link only shows a button: the GET does not spend the token', async () => {
    start('?t=one-time');
    await settle();
    expect(location.search).toBe('');
    expect(calls).toHaveLength(0);
    expect(text()).toContain('Показать мои билеты');
    expect(sessionStorage.getItem(LINK_TOKEN_KEY)).toBe('one-time');
  });

  it('the button exchanges the token, keeps the session in sessionStorage and lists the orders', async () => {
    routes['/my-tickets/session'] = () => json(session);
    routes['/my-tickets/orders?page=1'] = () => json(page([order()]));
    start('?t=one-time');
    click('.vc-mt button');
    await settle();
    const ex = calls.find((c) => c.url.endsWith('/v1/public/my-tickets/session'))!;
    expect(ex.method).toBe('POST');
    expect(ex.body).toEqual({ token: 'one-time' });
    expect(calls.find((c) => c.url.includes('/orders?page=1'))!.headers.Authorization).toBe('Bearer sess-1');
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).session_token).toBe('sess-1');
    expect(sessionStorage.getItem(LINK_TOKEN_KEY)).toBeNull();
    const t = text();
    expect(t).toContain('Премьера вина');
    expect(t).toContain('21 ноября 2026 г. в 19:30');
    expect(t).toContain('Винотека');
    expect(t).toContain('Заказ №1000123');
  });

  it('a used or expired link (410) says so and offers a new one', async () => {
    routes['/my-tickets/session'] = () => json({ error: { code: 'my_tickets.link_invalid', message: '' } }, 410);
    start('?t=old');
    click('.vc-mt button');
    await settle();
    expect(text()).toContain('Ссылка устарела или уже использована. Запросите новую.');
    expect(document.querySelector('#vc-mt-email')).not.toBeNull();
    expect(sessionStorage.getItem(LINK_TOKEN_KEY)).toBeNull();
  });

  it('a lost answer keeps the token so the button can be pressed again', async () => {
    routes['/my-tickets/session'] = () => {
      throw new TypeError('Failed to fetch');
    };
    start('?t=keep');
    click('.vc-mt button');
    await settle();
    expect(sessionStorage.getItem(LINK_TOKEN_KEY)).toBe('keep');
    expect(text()).toContain('Сервис временно недоступен');
  });

  it('resumes an open session after a reload and downloads a PDF through fetch + Bearer + blob', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes['/my-tickets/orders?page=1'] = () => json(page([order()]));
    routes['/tickets/tk1/pdf'] = () => new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { status: 200, headers: { 'content-type': 'application/pdf' } });
    const create = vi.fn(() => 'blob:ticket');
    const revoke = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    const downloads: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      downloads.push(`${this.href}|${this.download}`);
    };
    try {
      start();
      await settle();
      expect(calls.some((c) => c.url.endsWith('/session'))).toBe(false); // no exchange: the session was kept
      click('.vc-mt__tickets button');
      await settle();
      const pdf = calls.find((c) => c.url.endsWith('/tickets/tk1/pdf'))!;
      expect(pdf.url).toBe('https://api.test/v1/public/my-tickets/orders/o1/tickets/tk1/pdf');
      expect(pdf.headers.Authorization).toBe('Bearer sess-1');
      expect(create).toHaveBeenCalledOnce();
      expect(downloads).toEqual(['blob:ticket|vinoandco-1000123-AB12.pdf']);
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
  });

  it('shows a cancelled session and offers no PDF for a refunded order', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes['/my-tickets/orders?page=1'] = () => json(page([order({ session_cancelled: true }), order({ order_id: 'o2', status: 'refunded' })]));
    start();
    await settle();
    expect(text()).toContain('Мероприятие отменено');
    expect(text()).toContain('Заказ возвращён');
    expect(document.querySelectorAll('.vc-mt__tickets button')).toHaveLength(0);
  });

  it('a dead session (401) goes back to the e-mail form', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes['/my-tickets/orders?page=1'] = () => json({ error: { code: 'my_tickets.session_invalid', message: '' } }, 401);
    start();
    await settle();
    expect(text()).toContain('Сессия закончилась. Запросите новую ссылку.');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('log out revokes the session on the platform and clears the tab', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes['/my-tickets/orders?page=1'] = () => json(page([order()]));
    routes['/my-tickets/session'] = () => new Response(null, { status: 204 });
    start();
    await settle();
    click('.vc-mt__link');
    await settle();
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.headers.Authorization).toBe('Bearer sess-1');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(text()).toContain('Вы вышли.');
  });

  it('loads further pages on request', async () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    routes['/my-tickets/orders?page=1'] = () => json(page([order()], 1, 2));
    routes['/my-tickets/orders?page=2'] = () => json(page([order({ order_id: 'o9', order_number: 1000999, event: { ...order().event, name: 'Квиз' } })], 2, 2));
    start();
    await settle();
    const more = [...document.querySelectorAll<HTMLButtonElement>('.vc-mt button')].find((b) => b.textContent!.includes('Показать ещё'))!;
    more.click();
    await settle();
    expect(text()).toContain('Квиз');
    expect(text()).toContain('Премьера вина');
  });
});

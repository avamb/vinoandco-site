// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import OrderStatus from './OrderStatus.svelte';
import ru from '../../i18n/ru.json';
import { nextPollDelay, takeToken, viewOf } from '../../lib/order-status.ts';

type Call = { url: string; method: string };
let calls: Call[];
let statuses: unknown[];
let routes: Record<string, () => Response>;
let component: ReturnType<typeof mount> | null = null;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  calls = [];
  statuses = [];
  routes = {};
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? 'GET' });
    for (const [part, fn] of Object.entries(routes)) if (url.includes(part)) return fn();
    if (/\/v1\/public\/checkout\/[^/]+$/.test(url)) return json(statuses.length > 1 ? statuses.shift() : statuses[0]);
    if (url.endsWith('/referral')) return json({ error: { code: 'referral.not_available', message: '' } }, 404);
    throw new Error(`unexpected ${url}`);
  });
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function start(query = '') {
  history.replaceState(null, '', `/order-status/${query}`);
  component = mount(OrderStatus as unknown as Component<Record<string, unknown>>, {
    target: document.getElementById('root')!,
    props: {
      t: ru.orderStatus, apiBase: 'https://api.test', feedToken: 'tok', myTicketsPath: '/my-tickets/', upcomingPath: '/upcoming-events/',
      shareUrl: 'https://vinoandco.events/upcoming-events/', contactEmail: 'info@vinoandco.events',
    },
  });
  flushSync();
}
const settle = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flushSync();
};
const text = () => document.getElementById('root')!.textContent!.replace(/\s+/g, ' ');
const pending = { status: 'pending', checkout_token: 'ct', checkout_session_id: 'cs', items: [], tickets: [] };

describe('order status rules', () => {
  it('polls every 2 s for 20 s, then every 5 s up to 2 minutes', () => {
    expect([0, 19_999, 20_000, 119_999, 120_000].map(nextPollDelay)).toEqual([2000, 2000, 5000, 5000, null]);
  });
  it('takes the token from the address once and later from the tab', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(takeToken('https://x/order-status/?checkout_token=abc&x=1#h', s)).toEqual({ token: 'abc', cleanUrl: '/order-status/?x=1#h' });
    expect(takeToken('https://x/order-status/', s)).toEqual({ token: 'abc', cleanUrl: null });
  });
  it('maps platform states to screens', () => {
    expect(['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'manual_review', 'needs_help', 'weird'].map(viewOf)).toEqual(['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'review', 'review', 'pending']);
  });
});

describe('OrderStatus', () => {
  it('without a token tells where the status will appear', async () => {
    start();
    await settle();
    expect(text()).toContain('Здесь появится статус вашего заказа после оплаты.');
    expect(calls).toHaveLength(0);
  });

  it('removes the token from the address, checks until paid and shows the WordPress thank-you texts', async () => {
    statuses = [
      pending,
      pending,
      { ...pending, status: 'paid', order_number: 1000123, tickets: [{ ticket_id: 'tk1', human_code: 'AB12', pdf_url: '/v1/public/checkout/ct/tickets/tk1/pdf' }] },
    ];
    start('?checkout_token=ct');
    expect(location.search).toBe('');
    expect(sessionStorage.getItem('vc_checkout_token')).toBe('ct');
    await settle();
    expect(text()).toContain('Проверяем оплату…');
    await settle(2000);
    await settle(2000);
    expect(text()).toContain('Оплата прошла успешно');
    expect(text()).toContain('Ваши билеты успешно отправлены на ваш электронный адрес.');
    expect(text()).toContain('1000123');
    const pdf = document.querySelector<HTMLAnchorElement>('.vc-order__tickets a')!;
    expect(pdf.href).toBe('https://api.test/v1/public/checkout/ct/tickets/tk1/pdf');
    expect(document.querySelectorAll('.vc-order__share a')).toHaveLength(7);
    expect(document.querySelector('.vc-order__referral')).toBeNull();
    const n = calls.length;
    await settle(10_000);
    expect(calls.length).toBe(n); // final state: no more polling
  });

  it('after 2 minutes of pending says the tickets will come by e-mail and stops', async () => {
    statuses = [pending];
    sessionStorage.setItem('vc_checkout_token', 'ct');
    start();
    await settle();
    await settle(125_000);
    expect(text()).toContain('Оплата проверяется, билеты придут на e-mail');
    const polls = calls.filter((c) => c.url.endsWith('/checkout/ct')).length;
    expect(polls).toBe(1 + 10 + 20); // t=0, every 2 s to 20 s, every 5 s to 120 s
    await settle(60_000);
    expect(calls.filter((c) => c.url.endsWith('/checkout/ct')).length).toBe(polls);
  });

  it('a failed payment offers to try again on the same payment page', async () => {
    statuses = [{ ...pending, status: 'failed', payment_url: 'https://allpay.test/p/1' }];
    start('?checkout_token=ct');
    await settle();
    expect(text()).toContain('Оплата не прошла');
    expect(document.querySelector<HTMLAnchorElement>('a.vc-btn')!.href).toBe('https://allpay.test/p/1');
  });

  it('an expired order can take the seats again; seats already gone are said plainly', async () => {
    statuses = [{ ...pending, status: 'expired' }];
    routes['/recover'] = () => json({ error: { code: 'reservation.over_capacity', message: '' } }, 409);
    start('?checkout_token=ct');
    await settle();
    expect(text()).toContain('Время на оплату истекло');
    document.querySelector<HTMLButtonElement>('.vc-order button')!.click();
    await settle();
    expect(calls.find((c) => c.url.endsWith('/recover'))!.method).toBe('POST');
    expect(text()).toContain('Места уже заняли. Выберите билеты снова.');
  });

  it('shows "Refer a friend" only when the programme answers', async () => {
    statuses = [{ ...pending, status: 'paid' }];
    routes['/referral'] = () => json({ code: 'ANNA10', friend_discount_pct: 10, cashback_pct: 5, share_url: 'https://vinoandco.events/?ref=ANNA10' });
    start('?checkout_token=ct');
    await settle();
    await settle();
    expect(document.querySelector('.vc-order__referral')!.textContent).toContain('ANNA10');
    expect(text()).toContain('скидку 10%');
  });

  const event = { event_id: 'e1', session_id: 's1', name: 'Премьера вина', slug: 'premera', start_at: '2026-11-21T17:30:00Z', venue_name: 'Винотека', timezone: 'Asia/Jerusalem' };

  it('needs_help says the payment is being checked and the organizer will write, and stops polling', async () => {
    statuses = [{ ...pending, status: 'needs_help', event }];
    start('?checkout_token=ct');
    await settle();
    expect(text()).toContain('Мы проверяем ваш платёж');
    expect(text()).toContain('организатор свяжется с вами по e-mail');
    expect(text()).toContain('info@vinoandco.events');
    const n = calls.length;
    await settle(10_000);
    expect(calls.length).toBe(n);
  });

  it('refunded and cancelled orders have their own screens with the event', async () => {
    statuses = [{ ...pending, status: 'refunded', event }];
    start('?checkout_token=ct');
    await settle();
    expect(text()).toContain('Заказ возвращён');
    expect(text()).toContain('Премьера вина');
    unmount(component!);
    component = null;
    statuses = [{ ...pending, status: 'cancelled', event }];
    start('?checkout_token=ct');
    await settle();
    expect(text()).toContain('Заказ отменён');
  });

  it('renders the event block with the date in the venue time zone and uses pdf_url as given', async () => {
    statuses = [{ ...pending, status: 'paid', event, tickets: [{ ticket_id: 'tk1', human_code: 'AB12', pdf_url: 'https://api.test/v1/public/checkout/ct/tickets/tk1/pdf' }] }];
    start('?checkout_token=ct');
    await settle();
    const block = document.querySelector('.vc-order__event')!.textContent!.replace(/\s+/g, ' ');
    expect(block).toContain('Премьера вина');
    // 17:30 UTC is 19:30 in Jerusalem (winter time)
    expect(block).toContain('19:30');
    expect(block).toContain('Винотека');
    expect(document.querySelector<HTMLAnchorElement>('.vc-order__tickets a')!.href).toBe('https://api.test/v1/public/checkout/ct/tickets/tk1/pdf');
  });
});

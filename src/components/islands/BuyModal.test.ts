// @vitest-environment jsdom
/**
 * The purchase modal against a mocked platform. Nothing here reaches the
 * network: `checkout/start` on the real API creates real holds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import BuyModal from './BuyModal.svelte';
import ru from '../../i18n/ru.json';
import { nav } from '../../lib/purchase.ts';
import type { FeedSession, FeedTier } from '../../arena/types.ts';

function tier(p: Partial<FeedTier> = {}): FeedTier {
  return {
    id: 't1', name: 'Входной билет', pricing_mode: 'fixed', price_amount: 29000, currency: 'ILS', pwyw_min: null, pwyw_max: null,
    capacity: 100, sale_window_start: null, sale_window_end: null, sort_order: 0, current_price: 29000, next_price_change_at: null,
    is_open: true, available: 50, is_addon: false, ...p,
  };
}

function session(tiers: FeedTier[], p: Partial<FeedSession> = {}): FeedSession {
  return {
    id: 's1', start_at: '2030-11-21T18:30:00Z', end_at: '2030-11-21T21:30:00Z', sales_end_at: '2030-11-21T18:30:00Z', doors_open_at: null,
    capacity_total: 100, status: 'scheduled', buyer_fields: [], service_fee_percent: '0', promo_codes_available: true,
    consent: { required: false }, marketing_optin: { enabled: false }, timezone: 'Asia/Jerusalem', sales_state: 'open', tiers,
    poster_media_id: null, poster_url: null, ...p,
  };
}

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
let calls: Call[];
let routes: Record<string, (c: Call) => Response>;
let component: ReturnType<typeof mount> | null;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  routes = {};
  document.body.innerHTML = '<button data-vino-buy data-session="s1" id="buy">Купить билет</button><div id="root"></div>';
  sessionStorage.clear();
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    const c: Call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    for (const [part, fn] of Object.entries(routes)) if (url.includes(part)) return fn(c);
    if (url.includes('/funnel')) return new Response(null, { status: 204 });
    if (url.includes('/events/e1')) return json({ error: { code: 'feed.fetch_failed', message: '' } }, 503);
    throw new Error(`unexpected ${url}`);
  });
  vi.spyOn(nav, 'go').mockImplementation(() => {});
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open(sessions: FeedSession[]) {
  // Astro's .svelte typings describe the Astro wrapper, not the Svelte component.
  component = mount(BuyModal as unknown as Component<Record<string, unknown>>, {
    target: document.getElementById('root')!,
    props: {
      t: ru.modal, lang: 'ru', intl: 'ru-RU', eventId: 'e1', eventName: 'Премьера', eventPath: '/event/premera/', sessions,
      apiBase: 'https://api.test', feedToken: 'tok', returnUrl: 'https://new.vinoandco.events/order-status/', sessionId: 's1',
    },
  });
  flushSync();
  document.getElementById('buy')!.click();
  flushSync();
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};
function type(sel: string, value: string) {
  const el = $<HTMLInputElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
function fill() {
  type('#vino-field-fullname', 'Анна Коэн');
  type('#vino-field-phone', '+972501234567');
  type('#vino-field-email', 'anna@example.com');
}
const pay = () => $<HTMLButtonElement>('.vino-modal-btn-primary').click();

describe('BuyModal', () => {
  it('with one category opens on "Your details" with the WordPress texts', async () => {
    open([session([tier()])]);
    await settle();
    expect($('#vino-modal-title').textContent).toBe('Ваши данные');
    expect($('.vino-modal-timer').textContent).toBe('Ваши места зарезервированы на 19 минут');
    expect($('.vino-booking-summary').textContent).toContain('Билет');
    expect($('.vino-booking-summary').textContent).toContain('290');
    expect($('#vino-field-phone').getAttribute('placeholder')).toBe('+972');
    // the funnel counts the session and the chosen tickets, without consent
    const steps = calls.filter((c) => c.url.endsWith('/v1/public/funnel')).map((c) => c.body.step);
    expect(steps).toEqual(['session_open', 'seats_chosen']);
    expect(calls.find((c) => c.url.endsWith('/funnel'))!.body.surface).toBe('external_site');
  });

  it('with several categories starts with "Select ticket" and hides a sold-out one', async () => {
    open([session([tier({ id: 'a', name: 'VIP', current_price: 50000 }), tier({ id: 'b', name: 'Обычный' }), tier({ id: 'c', name: 'Ранний', available: 0 })])]);
    await settle();
    expect($('#vino-modal-title').textContent).toBe('Выбор билета');
    const options = [...document.querySelectorAll('#vino-modal-category option')].map((o) => o.textContent!.replace(/ /g, ' '));
    expect(options).toEqual(['— выберите —', 'VIP — 500 ₪', 'Обычный — 290 ₪']);
    pay(); // "Далее →" without a choice
    flushSync();
    expect($('.vino-field-error').textContent).toBe('Выберите категорию');
    const select = $<HTMLSelectElement>('#vino-modal-category');
    select.value = 'a';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    pay();
    flushSync();
    expect($('#vino-modal-title').textContent).toBe('Ваши данные');
    expect($('.vino-modal-back-link').textContent).toBe('← Назад');
  });

  it('refuses PAY until name, phone and a valid e-mail are filled', async () => {
    open([session([tier()])]);
    await settle();
    type('#vino-field-email', 'not-an-email');
    pay();
    flushSync();
    expect($('.vino-step-errors').textContent).toBe('Заполните все обязательные поля');
    expect($('.vino-field-error').textContent).toBe('Введите корректный email');
    expect(calls.some((c) => c.url.includes('checkout/start'))).toBe(false);
  });

  it('PAY sends one checkout/start with an Idempotency-Key and goes to the payment page', async () => {
    sessionStorage.setItem('arena_attribution', JSON.stringify({ ref: 'QR7', utm_source: 'ig', landed_at: '2026-11-06T10:00:00Z' }));
    routes['checkout/start'] = () => json({ checkout_token: 'ct-1', redirect_url: 'https://allpay.test/pay/1', expires_at: 'x', pricing: { total: 58000 } }, 201);
    open([session([tier()])]);
    await settle();
    fill();
    $<HTMLButtonElement>('.vino-qty-btn[aria-label="+"]').click();
    flushSync();
    pay();
    await settle();
    const start = calls.find((c) => c.url.endsWith('/v1/public/feeds/tok/checkout/start'))!;
    expect(start.method).toBe('POST');
    expect(start.headers['Idempotency-Key']).toMatch(/.{8,}/);
    expect(start.body).toMatchObject({
      session_id: 's1',
      ga_items: [{ tier_id: 't1', quantity: 2 }],
      buyer: { email: 'anna@example.com', name: 'Анна Коэн', phone: '+972501234567' },
      return_url: 'https://new.vinoandco.events/order-status/',
      locale: 'ru',
      attribution: { ref: 'QR7', utm_source: 'ig' },
      expected_total: 58000,
    });
    expect(nav.go).toHaveBeenCalledWith('https://allpay.test/pay/1');
    expect(sessionStorage.getItem('vc_checkout_token')).toBe('ct-1');
  });

  it('a lost answer keeps the key; another body after a 409 mismatch gets a new one', async () => {
    let n = 0;
    routes['checkout/start'] = () => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return json({ error: { code: 'idempotency.body_mismatch', message: '' } }, 409);
      return json({ checkout_token: 'ct', redirect_url: 'https://allpay.test/p', expires_at: 'x', pricing: { total: 29000 } }, 201);
    };
    open([session([tier()])]);
    await settle();
    fill();
    pay();
    await settle();
    expect($('.vino-step-errors').textContent).toBe('Ошибка. Попробуйте снова.');
    pay();
    await settle();
    expect($('.vino-step-errors').textContent).toBe('Данные заказа изменились. Нажмите «ОПЛАТИТЬ» ещё раз.');
    pay();
    await settle();
    const keys = calls.filter((c) => c.url.includes('checkout/start')).map((c) => c.headers['Idempotency-Key']);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(nav.go).toHaveBeenCalledTimes(1);
  });

  it('shows the site words for platform error codes', async () => {
    routes['checkout/start'] = () => json({ error: { code: 'reservation.over_capacity', message: 'x' } }, 409);
    open([session([tier()])]);
    await settle();
    fill();
    pay();
    await settle();
    expect($('.vino-step-errors').textContent).toBe('К сожалению, выбранные билеты уже недоступны. Обновите страницу и попробуйте снова.');
    expect($<HTMLButtonElement>('.vino-modal-btn-primary').disabled).toBe(false);
  });

  it('a changed price is shown and confirmed by the next PAY with a new key', async () => {
    let n = 0;
    routes['checkout/start'] = () =>
      ++n === 1
        ? json({ error: { code: 'checkout.price_changed', message: '', details: { total: 31000 } } }, 409)
        : json({ checkout_token: 'ct', redirect_url: 'https://allpay.test/p', expires_at: 'x', pricing: { total: 31000 } }, 201);
    open([session([tier()])]);
    await settle();
    fill();
    pay();
    await settle();
    expect($('.vino-step-errors').textContent).toContain('310');
    pay();
    await settle();
    const starts = calls.filter((c) => c.url.includes('checkout/start'));
    expect(starts[1].body.expected_total).toBe(31000);
    expect(starts[1].headers['Idempotency-Key']).not.toBe(starts[0].headers['Idempotency-Key']);
  });

  it('applies a promo code through checkout/quote and sends it with PAY', async () => {
    routes['checkout/quote'] = (c) =>
      json({ pricing: { subtotal: 29000, discount: 2900, total: 26100, currency: 'ILS', unit_price: 29000, quantity: 1, platform_fee: 0, provider_fee: 0, tax: 0 }, promo_applied: c.body.promo_code === 'CAT', marketing_discount_applied: false });
    routes['checkout/start'] = () => json({ checkout_token: 'ct', redirect_url: 'https://allpay.test/p', expires_at: 'x', pricing: { total: 26100 } }, 201);
    open([session([tier()])]);
    await settle();
    $<HTMLButtonElement>('.vino-promo-toggle').click();
    flushSync();
    type('.vino-promo-row input', 'CAT');
    $<HTMLButtonElement>('.vino-promo-apply').click();
    await settle();
    expect(calls.find((c) => c.url.includes('checkout/quote'))!.body).toEqual({ session_id: 's1', ga_items: [{ tier_id: 't1', quantity: 1 }], promo_code: 'CAT' });
    expect($('.vino-promo-result').textContent).toBe('✓ Промокод применён');
    expect($('.vino-promo-line').textContent).toContain('Промокод CAT: −29');
    expect($('.vino-booking-summary').textContent).toContain('261');
    fill();
    pay();
    await settle();
    const start = calls.find((c) => c.url.includes('checkout/start'))!;
    expect(start.body.promo_code).toBe('CAT');
    expect(start.body.expected_total).toBe(26100);
  });

  it('a refused promo code shows the dictionary text and does not block PAY', async () => {
    routes['checkout/quote'] = () => json({ error: { code: 'promo.not_found', message: '' } }, 422);
    open([session([tier()])]);
    await settle();
    $<HTMLButtonElement>('.vino-promo-toggle').click();
    flushSync();
    type('.vino-promo-row input', 'NOPE');
    $<HTMLButtonElement>('.vino-promo-apply').click();
    await settle();
    expect($('.vino-promo-result').textContent).toBe('Промокод не найден');
    expect($<HTMLButtonElement>('.vino-promo-apply').disabled).toBe(false);
  });

  it('sends the mailing tick with the text version of the session', async () => {
    routes['checkout/start'] = () => json({ checkout_token: 'ct', redirect_url: 'https://allpay.test/p', expires_at: 'x', pricing: { total: 29000 } }, 201);
    open([session([tier()], { marketing_optin: { enabled: true, org_name: 'Vino&Co', text_version: 'v3', discount: { type: 'percent', value: 10 } } })]);
    await settle();
    expect($('.vino-modal-check').textContent).toContain('Присылайте мне новости и предложения от Vino&Co. Скидка 10 % на этот заказ.');
    $<HTMLInputElement>('.vino-modal-check input').click();
    flushSync();
    fill();
    pay();
    await settle();
    expect(calls.find((c) => c.url.includes('checkout/start'))!.body.marketing_consent).toEqual({ accepted: true, text_version: 'v3' });
  });
});

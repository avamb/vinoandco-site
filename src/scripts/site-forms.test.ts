// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArenaClient } from '../arena/client.ts';
import { CLUB_TEXT_VERSION, clubPayload, contactPayload, formErrorKey, turnstileAction, validateForm } from '../lib/forms.ts';
import { ArenaApiError, ArenaNetworkError } from '../arena/client.ts';
import { initSiteForm, type TurnstileApi } from './site-forms.ts';
import ru from '../i18n/ru.json';

const f = ru.forms;
const texts = (sent: string) => JSON.stringify({ unavailable: f.unavailable, sending: f.sending, sent, captchaWait: f.captchaWait, errors: f.errors });

const FIELDS: Record<string, string> = {
  contact: `<input name="first_name"><input name="last_name"><input name="email"><input name="phone"><textarea name="message"></textarea>`,
  private: `<input name="name"><input name="email"><input name="phone"><textarea name="message"></textarea>`,
  club: `<input name="name"><input name="email"><input name="phone"><input type="checkbox" name="marketing">`,
};

function build(kind: 'contact' | 'private' | 'club') {
  document.body.innerHTML = `<form data-form-kind="${kind}" data-texts='${texts('SENT-' + kind)}' novalidate>${FIELDS[kind]}<input type="checkbox" name="consent"><div data-turnstile></div><p data-form-status hidden></p><button type="submit">Send</button></form>`;
  return document.querySelector('form')!;
}
const set = (form: HTMLFormElement, name: string, value: string | boolean) => {
  const el = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  if (typeof value === 'boolean') el.checked = value;
  else el.value = value;
};
const submit = async (form: HTMLFormElement) => {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
const status = () => document.querySelector<HTMLElement>('[data-form-status]')!.textContent;

let calls: { url: string; headers: Record<string, string>; body: any }[];
let answer: () => Response;
let widgetOpts: Record<string, any>;
let reset: ReturnType<typeof vi.fn>;

function setup(kind: 'contact' | 'private' | 'club', siteKey = 'SITEKEY') {
  const form = build(kind);
  const turnstile: TurnstileApi = {
    render: (_el, opts) => {
      widgetOpts = opts;
      return 'w1';
    },
    reset: reset as unknown as TurnstileApi['reset'],
  };
  const client = createArenaClient({
    apiBase: 'https://api.test',
    feedToken: 'tok',
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) });
      return answer();
    }) as typeof fetch,
  });
  initSiteForm(form, { client, loadTurnstile: async () => turnstile, siteKey, locale: 'he', pageUrl: () => 'https://vinoandco.events/he/' });
  return form;
}
const accepted = () => new Response(JSON.stringify({ status: 'queued' }), { status: 202, headers: { 'content-type': 'application/json' } });
const failed = (status: number, code: string) => () => new Response(JSON.stringify({ error: { code, message: '' } }), { status, headers: { 'content-type': 'application/json' } });
async function fillAndCheck(form: HTMLFormElement, kind: 'contact' | 'private' | 'club') {
  if (kind === 'contact') {
    set(form, 'first_name', ' Анна ');
    set(form, 'last_name', 'Коэн');
    set(form, 'message', '');
  } else set(form, 'name', 'Анна Коэн');
  if (kind === 'private') set(form, 'message', 'Хотим провести дегустацию для 30 гостей.');
  if (kind === 'club') set(form, 'marketing', true);
  set(form, 'email', 'anna@example.com');
  set(form, 'phone', '+972 50 123 4567');
  set(form, 'consent', true);
  form.dispatchEvent(new Event('focusin', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  widgetOpts.callback('CAPTCHA-TOKEN');
}

beforeEach(() => {
  calls = [];
  answer = accepted;
  reset = vi.fn();
});

describe('payload shapes', () => {
  const v = { first_name: ' Анна ', last_name: 'Коэн', name: 'Анна Коэн', email: ' a@b.co ', phone: '+972 50 123', message: ' привет, как дела ', consent: true, marketing: true };
  it('contact: name and last_name, topic contact, no empty optional field', () => {
    expect(contactPayload('contact', v, 'ru', 'tok')).toEqual({ topic: 'contact', name: 'Анна', last_name: 'Коэн', email: 'a@b.co', phone: '+972 50 123', message: 'привет, как дела', consent: true, locale: 'ru', turnstile_token: 'tok' });
    expect(contactPayload('contact', { ...v, message: '', last_name: '' }, 'ru', 't')).not.toHaveProperty('message');
  });
  it('private event: full name in name, topic private_event', () => {
    const p = contactPayload('private', v, 'en', 'tok');
    expect(p).toMatchObject({ topic: 'private_event', name: 'Анна Коэн' });
    expect(p).not.toHaveProperty('last_name');
  });
  it('club: text version, page url, consent', () => {
    expect(clubPayload(v, 'he', 'https://vinoandco.events/he/', 'tok')).toEqual({ email: 'a@b.co', locale: 'he', consent: true, text_version: CLUB_TEXT_VERSION, turnstile_token: 'tok', name: 'Анна Коэн', phone: '+972 50 123', page_url: 'https://vinoandco.events/he/' });
    expect(CLUB_TEXT_VERSION).toMatch(/^club-2026-\d\d$/);
  });
  it('the Turnstile action equals the topic, club for sign-ups', () => {
    expect([turnstileAction('contact'), turnstileAction('private'), turnstileAction('club')]).toEqual(['contact', 'private_event', 'club']);
  });
  it('validates required fields, e-mail, phone and the ticks', () => {
    expect(validateForm('contact', { ...v, last_name: '' })).toBe('fillRequired');
    expect(validateForm('contact', { ...v, email: 'nope' })).toBe('invalidEmail');
    expect(validateForm('contact', { ...v, phone: 'abc' })).toBe('invalid');
    expect(validateForm('private', { ...v, message: '' })).toBe('fillRequired');
    expect(validateForm('contact', { ...v, consent: false })).toBe('consentRequired');
    expect(validateForm('club', { ...v, marketing: false })).toBe('consentRequired');
    expect(validateForm('contact', v)).toBeNull();
  });
});

describe('error dictionary', () => {
  const api = (status: number, code: string) => new ArenaApiError(status, code, '');
  it('maps platform answers to the site words', () => {
    expect(formErrorKey(api(429, 'contact.rate_limited'))).toBe('rateLimited');
    expect(formErrorKey(api(403, 'contact.captcha_failed'))).toBe('captcha');
    expect(formErrorKey(api(503, 'contact.captcha_unavailable'))).toBe('unavailable');
    expect(formErrorKey(api(404, 'contact.not_available'))).toBe('notAvailable');
    expect(formErrorKey(api(400, 'contact.consent_required'))).toBe('consentRequired');
    expect(formErrorKey(api(400, 'subscription.invalid_email'))).toBe('invalidEmail');
    expect(formErrorKey(api(400, 'contact.invalid_phone'))).toBe('invalid');
    expect(formErrorKey(api(500, 'contact.send_failed'))).toBe('generic');
    expect(formErrorKey(new ArenaNetworkError('x', false))).toBe('network');
  });
});

describe('forms on the page', () => {
  it('contact form posts to organizer-contact with the topic action, an Idempotency-Key and shows the thank-you', async () => {
    const form = setup('contact');
    await fillAndCheck(form, 'contact');
    expect(widgetOpts).toMatchObject({ sitekey: 'SITEKEY', action: 'contact' });
    await submit(form);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test/v1/public/feeds/tok/organizer-contact');
    expect(calls[0].headers['Idempotency-Key']).toMatch(/.{8,}/);
    expect(calls[0].body).toEqual({ topic: 'contact', name: 'Анна', last_name: 'Коэн', email: 'anna@example.com', phone: '+972 50 123 4567', consent: true, locale: 'he', turnstile_token: 'CAPTCHA-TOKEN' });
    expect(status()).toBe('SENT-contact');
    expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  });

  it('private-event form uses the private_event action and topic', async () => {
    const form = setup('private');
    await fillAndCheck(form, 'private');
    expect(widgetOpts.action).toBe('private_event');
    await submit(form);
    expect(calls[0].body).toMatchObject({ topic: 'private_event', name: 'Анна Коэн', message: 'Хотим провести дегустацию для 30 гостей.' });
  });

  it('club form posts to marketing-subscriptions with action club, text_version and page_url', async () => {
    const form = setup('club');
    await fillAndCheck(form, 'club');
    expect(widgetOpts.action).toBe('club');
    answer = () => new Response(JSON.stringify({ status: 'check_email' }), { status: 202, headers: { 'content-type': 'application/json' } });
    await submit(form);
    expect(calls[0].url).toBe('https://api.test/v1/public/feeds/tok/marketing-subscriptions');
    expect(calls[0].body).toEqual({ email: 'anna@example.com', name: 'Анна Коэн', phone: '+972 50 123 4567', locale: 'he', consent: true, text_version: CLUB_TEXT_VERSION, page_url: 'https://vinoandco.events/he/', turnstile_token: 'CAPTCHA-TOKEN' });
    expect(status()).toBe('SENT-club');
  });

  it('does not send without the captcha token and says to wait', async () => {
    const form = setup('contact');
    await fillAndCheck(form, 'contact');
    widgetOpts['expired-callback']();
    await submit(form);
    expect(calls).toHaveLength(0);
    expect(status()).toBe(f.captchaWait);
  });

  it('does not send an invalid form', async () => {
    const form = setup('contact');
    await fillAndCheck(form, 'contact');
    set(form, 'email', 'broken');
    await submit(form);
    expect(calls).toHaveLength(0);
    expect(status()).toBe(f.errors.invalidEmail);
  });

  it('a definite refusal shows its text, resets the captcha and uses a new key next time', async () => {
    const form = setup('contact');
    await fillAndCheck(form, 'contact');
    answer = failed(403, 'contact.captcha_failed');
    await submit(form);
    expect(status()).toBe(f.errors.captcha);
    expect(reset).toHaveBeenCalledWith('w1');
    expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
    answer = accepted;
    widgetOpts.callback('SECOND-TOKEN');
    await submit(form);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['Idempotency-Key']).not.toBe(calls[0].headers['Idempotency-Key']);
    expect(calls[1].body.turnstile_token).toBe('SECOND-TOKEN');
  });

  it('a lost answer keeps the key and the token, so the retry replays the first submission', async () => {
    const form = setup('contact');
    await fillAndCheck(form, 'contact');
    answer = () => {
      throw new TypeError('Failed to fetch');
    };
    await submit(form);
    expect(status()).toBe(f.errors.network);
    expect(reset).not.toHaveBeenCalled();
    answer = accepted;
    await submit(form);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['Idempotency-Key']).toBe(calls[0].headers['Idempotency-Key']);
    expect(calls[1].body).toEqual(calls[0].body);
  });

  it('429, 503 and 404 have their own words', async () => {
    for (const [st, code, key] of [[429, 'contact.rate_limited', 'rateLimited'], [503, 'contact.captcha_not_configured', 'unavailable'], [404, 'contact.not_available', 'notAvailable']] as const) {
      const form = setup('contact');
      await fillAndCheck(form, 'contact');
      answer = failed(st, code);
      await submit(form);
      expect(status()).toBe((f.errors as Record<string, string>)[key]);
    }
  });

  it('without a Turnstile site key the form is disabled and sends nothing', async () => {
    const form = setup('contact', '');
    expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    expect(status()).toBe(f.unavailable);
    await submit(form);
    expect(calls).toHaveLength(0);
  });
});

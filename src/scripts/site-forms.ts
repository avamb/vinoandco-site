/**
 * Wires the site forms (contact, private event, club) to the platform
 * (spec 62 §10.2). Cloudflare Turnstile is strictly necessary (it protects the
 * form), so it loads without the cookie banner, from challenges.cloudflare.com
 * (allowed by the CSP), and only when a visitor touches a form. The widget
 * action equals the topic (`contact`, `private_event`) or `club`.
 *
 * `initSiteForm` takes everything with side effects as arguments, so the tests
 * run it on a plain DOM with a mocked fetch.
 */
import { createAttemptKeys } from '../arena/cart.ts';
import type { ArenaClient } from '../arena/client.ts';
import { clubPayload, contactPayload, formErrorKey, isDefinite, turnstileAction, validateForm, type FormKind, type FormValues } from '../lib/forms.ts';

export interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
}

export interface FormTexts {
  unavailable: string;
  sending: string;
  sent: string;
  captchaWait: string;
  errors: Record<string, string>;
}

export interface SiteFormDeps {
  client: Pick<ArenaClient, 'sendOrganizerContact' | 'subscribeMarketing'>;
  /** Loads the Turnstile script once; null when it cannot be loaded. */
  loadTurnstile: () => Promise<TurnstileApi | null>;
  siteKey: string;
  locale: string;
  /** The page the form is on (club confirmation sends the person back there). */
  pageUrl: () => string;
}

const field = (form: HTMLFormElement, name: string): HTMLInputElement | HTMLTextAreaElement | null => form.querySelector(`[name="${name}"]`);

function readValues(form: HTMLFormElement): FormValues {
  const text = (n: string) => field(form, n)?.value ?? '';
  const tick = (n: string) => (field(form, n) as HTMLInputElement | null)?.checked ?? false;
  return {
    first_name: text('first_name'),
    last_name: text('last_name'),
    name: text('name'),
    email: text('email'),
    phone: text('phone'),
    message: text('message'),
    marketing: tick('marketing'),
    consent: tick('consent'),
  };
}

export function initSiteForm(form: HTMLFormElement, deps: SiteFormDeps): void {
  const kind = form.dataset.formKind as FormKind;
  const texts = JSON.parse(form.dataset.texts || '{}') as FormTexts;
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  const holder = form.querySelector<HTMLElement>('[data-turnstile]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const keys = createAttemptKeys();
  let api: TurnstileApi | null = null;
  let widget: string | null = null;
  let token = '';
  let busy = false;

  const say = (message: string, kindOfMessage: 'info' | 'error' | 'ok' = 'info') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = kindOfMessage;
    status.hidden = !message;
  };

  if (!deps.siteKey) {
    // No site key in the build: the form cannot be verified, so it does not pretend to work.
    if (button) button.disabled = true;
    say(texts.unavailable, 'error');
    return;
  }

  async function ensureWidget(): Promise<void> {
    if (widget !== null || !holder) return;
    api = await deps.loadTurnstile();
    if (!api) return;
    widget = api.render(holder, {
      sitekey: deps.siteKey,
      action: turnstileAction(kind),
      callback: (t: string) => {
        token = t;
      },
      'expired-callback': () => {
        token = '';
      },
      'error-callback': () => {
        token = '';
      },
    });
  }

  function resetCaptcha() {
    token = '';
    if (api && widget !== null) api.reset(widget);
  }

  form.addEventListener('focusin', () => void ensureWidget(), { once: true });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const values = readValues(form);
    const problem = validateForm(kind, values);
    if (problem) {
      say(texts.errors[problem] ?? texts.errors.generic, 'error');
      return;
    }
    if (!token) {
      void ensureWidget();
      say(texts.captchaWait, 'info');
      return;
    }
    busy = true;
    if (button) button.disabled = true;
    say(texts.sending, 'info');
    const locale = deps.locale;
    try {
      if (kind === 'club') {
        const body = clubPayload(values, locale, deps.pageUrl(), token);
        await deps.client.subscribeMarketing(body, keys.keyFor(body));
      } else {
        const body = contactPayload(kind, values, locale, token);
        await deps.client.sendOrganizerContact(body, keys.keyFor(body));
      }
      form.reset();
      for (const el of Array.from(form.elements)) (el as HTMLElement).setAttribute('disabled', '');
      say(texts.sent, 'ok');
      resetCaptcha();
      return;
    } catch (e) {
      say(texts.errors[formErrorKey(e)] ?? texts.errors.generic, 'error');
      // A definite answer spent the single-use token: a new check and a new key.
      // A lost answer keeps both, so pressing again replays the first submission.
      if (isDefinite(e)) {
        keys.reset();
        resetCaptcha();
      }
    }
    busy = false;
    if (button) button.disabled = false;
  });
}

let turnstileLoading: Promise<TurnstileApi | null> | null = null;

/** Loads Cloudflare Turnstile once (explicit rendering). */
export function loadTurnstileScript(): Promise<TurnstileApi | null> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(w.turnstile ?? null);
      s.onerror = () => {
        turnstileLoading = null;
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}

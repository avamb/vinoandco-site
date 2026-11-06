/**
 * Vino&Co side of the site forms (spec 62 §10.2): what each form sends to the
 * platform and which of the site own words an error code gets. Platform
 * calls live in src/arena/client.ts; this file is pure.
 */
import { ArenaApiError, ArenaNetworkError } from '../arena/client.ts';
import { EMAIL_RE } from '../arena/cart.ts';
import type { ContactTopic, MarketingSubscriptionRequest, OrganizerContactRequest } from '../arena/types.ts';

export type FormKind = 'contact' | 'private' | 'club';

/** Version of the club consent text; bump it when the text of the tick changes. */
export const CLUB_TEXT_VERSION = 'club-2026-11';

/** The platform checks 5-30 characters of digits, spaces and + ( ) - . */
export const PHONE_RE = /^[0-9 +().-]{5,30}$/;

export interface FormValues {
  first_name?: string;
  last_name?: string;
  /** Full name (private-event and club forms). */
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  /** Club: the tick on receiving mailings. */
  marketing?: boolean;
  /** The tick on the terms and the privacy policy. */
  consent?: boolean;
}

/** The Turnstile action of a form; the platform demands that it equals the topic (club for sign-ups). */
export function turnstileAction(kind: FormKind): string {
  return kind === 'private' ? 'private_event' : kind;
}

export function topicOf(kind: FormKind): ContactTopic {
  return kind === 'private' ? 'private_event' : 'contact';
}

const clean = (v: string | undefined) => (v ?? '').trim();

export type ValidationError = 'fillRequired' | 'invalidEmail' | 'invalid' | 'consentRequired';

/** First problem found, or null. Mirrors the required fields of the WordPress forms. */
export function validateForm(kind: FormKind, v: FormValues): ValidationError | null {
  const name = kind === 'contact' ? clean(v.first_name) && clean(v.last_name) : clean(v.name);
  if (!name || !clean(v.email) || !clean(v.phone)) return 'fillRequired';
  if (kind === 'private' && !clean(v.message)) return 'fillRequired';
  if (!EMAIL_RE.test(clean(v.email))) return 'invalidEmail';
  if (!PHONE_RE.test(clean(v.phone))) return 'invalid';
  if (kind === 'private' && clean(v.message).length < 10) return 'invalid';
  if (!v.consent || (kind === 'club' && !v.marketing)) return 'consentRequired';
  return null;
}

/** Body of POST .../organizer-contact. Empty optional fields are left out. */
export function contactPayload(kind: 'contact' | 'private', v: FormValues, locale: string, turnstileToken: string): OrganizerContactRequest {
  const body: OrganizerContactRequest = {
    topic: topicOf(kind),
    name: kind === 'contact' ? clean(v.first_name) : clean(v.name),
    email: clean(v.email),
    consent: true,
    locale,
    turnstile_token: turnstileToken,
  };
  if (kind === 'contact' && clean(v.last_name)) body.last_name = clean(v.last_name);
  if (clean(v.phone)) body.phone = clean(v.phone);
  if (clean(v.message)) body.message = clean(v.message);
  return body;
}

/** Body of POST .../marketing-subscriptions (the club). `consent` is the marketing tick. */
export function clubPayload(v: FormValues, locale: string, pageUrl: string, turnstileToken: string): MarketingSubscriptionRequest {
  const body: MarketingSubscriptionRequest = {
    email: clean(v.email),
    locale,
    consent: true,
    text_version: CLUB_TEXT_VERSION,
    turnstile_token: turnstileToken,
  };
  if (clean(v.name)) body.name = clean(v.name);
  if (clean(v.phone)) body.phone = clean(v.phone);
  if (pageUrl) body.page_url = pageUrl;
  return body;
}

export type FormErrorKey = 'generic' | 'network' | 'rateLimited' | 'captcha' | 'unavailable' | 'invalid' | 'invalidEmail' | 'consentRequired' | 'notAvailable';

/** The site words for a failed submission (keys of `forms.errors` in src/i18n). */
export function formErrorKey(e: unknown): FormErrorKey {
  if (e instanceof ArenaNetworkError) return 'network';
  if (e instanceof ArenaApiError) {
    if (e.status === 429) return 'rateLimited';
    if (e.status === 403) return 'captcha';
    if (e.status === 503 || e.status === 502) return 'unavailable';
    if (e.status === 404) return 'notAvailable';
    if (e.status === 400 || e.status === 413) {
      if (e.code.endsWith('consent_required')) return 'consentRequired';
      if (e.code.endsWith('invalid_email')) return 'invalidEmail';
      return 'invalid';
    }
  }
  return 'generic';
}

/**
 * Does the failure prove that the platform did not take the submission (so a
 * single-use captcha token is spent and the key must change)? A network error
 * or a timeout proves nothing: the retry keeps the same key and body.
 */
export function isDefinite(e: unknown): boolean {
  return e instanceof ArenaApiError;
}

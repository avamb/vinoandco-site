/**
 * The platform's own sales funnel (spec 50, spec 62 §8.2): view, session_open,
 * seats_chosen. It stores no visitor data and sets no cookie, so it runs
 * without cookie consent. Each step is sent at most once per event and
 * session per page view. The surface `external_site` is pending on the
 * platform (П-21); until then the platform answers 204 and does not count it.
 */
import type { ArenaClient } from '../arena/client.ts';
import { readAttribution } from '../arena/attribution.ts';

const sent = new Set<string>();

function utm(): { utm_source?: string; utm_campaign?: string } {
  try {
    const a = readAttribution(sessionStorage);
    return { ...(a?.utm_source ? { utm_source: a.utm_source } : {}), ...(a?.utm_campaign ? { utm_campaign: a.utm_campaign } : {}) };
  } catch {
    return {};
  }
}

export function funnelStep(client: ArenaClient, step: 'view' | 'session_open' | 'seats_chosen', eventId: string, sessionId?: string) {
  const key = `${step}:${eventId}:${sessionId ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);
  void client.funnel({ event_id: eventId, ...(sessionId ? { session_id: sessionId } : {}), step, surface: 'external_site', ...utm() });
}

export function funnelSessionOpen(client: ArenaClient, eventId: string, sessionId: string) {
  if (sessionId) funnelStep(client, 'session_open', eventId, sessionId);
}

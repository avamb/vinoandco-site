/**
 * Minimal client for the Arena public feed. Used by the builder (Node) at build
 * time and, later, by islands in the browser. No markup, no site specifics.
 */
import type { EventsSnapshot, FeedEventDetail, FeedEventList } from './types.ts';

export interface ArenaClientOptions {
  /** API origin, e.g. https://api.arenasoldout.com */
  apiBase: string;
  /** Public feed token of the sales channel. */
  feedToken: string;
  fetch?: typeof fetch;
  /** Request timeout, ms. */
  timeoutMs?: number;
}

export class ArenaApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ArenaApiError';
  }
}

export function createArenaClient(opts: ArenaClientOptions) {
  const base = opts.apiBase.replace(/\/+$/, '');
  const token = encodeURIComponent(opts.feedToken);
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  async function get<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(`${base}${path}`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let code = `http_${res.status}`;
        let message = res.statusText;
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          /* not JSON */
        }
        throw new ArenaApiError(res.status, code, message);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async function listEvents(page = 1, perPage = 100): Promise<FeedEventList> {
    return get<FeedEventList>(`/v1/public/feeds/${token}/events?page=${page}&per_page=${perPage}`);
  }

  async function getEvent(eventId: string): Promise<FeedEventDetail> {
    return get<FeedEventDetail>(`/v1/public/feeds/${token}/events/${encodeURIComponent(eventId)}`);
  }

  /**
   * Complete pass over the feed: every page, then the detail of every event.
   * Throws if the pass is incomplete, so a partial snapshot is never published
   * (spec 62 §9 "Полнота").
   */
  async function fetchSnapshot(): Promise<EventsSnapshot> {
    const first = await listEvents(1);
    const list = [...first.events];
    for (let p = 2; p <= first.pagination.total_pages; p++) {
      list.push(...(await listEvents(p)).events);
    }
    if (list.length !== first.pagination.total) {
      throw new Error(`feed pass incomplete: ${list.length} of ${first.pagination.total}`);
    }
    const events: FeedEventDetail[] = [];
    for (const e of list) events.push(await getEvent(e.id));
    return { fetched_at: new Date().toISOString(), source: 'feed', events };
  }

  return { listEvents, getEvent, fetchSnapshot };
}

export type ArenaClient = ReturnType<typeof createArenaClient>;

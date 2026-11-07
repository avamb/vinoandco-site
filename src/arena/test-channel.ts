/**
 * Test channel (staging only): a second sales channel with its own feed token
 * whose events are never in the production feed. Pure helpers, no I/O.
 */
import type { FeedEvent } from './types.ts';

/** Ids from `TEST_EVENT_IDS`: comma / semicolon / whitespace separated, trimmed, deduplicated (UUIDs lower-cased). */
export function parseTestEventIds(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[\s,;]+/)) {
    const id = part.trim();
    if (!id) continue;
    const norm = id.toLowerCase();
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

export interface TestChannelConfig {
  token: string;
  ids: string[];
  /** Both a token and at least one id are needed; otherwise nothing changes. */
  enabled: boolean;
}

export function testChannelConfig(env: Record<string, string | undefined>): TestChannelConfig {
  const token = (env.PUBLIC_TEST_FEED_TOKEN ?? '').trim();
  const ids = parseTestEventIds(env.TEST_EVENT_IDS);
  return { token, ids, enabled: Boolean(token) && ids.length > 0 };
}

/** The listed events whose platform UUID or display number is named in `ids`. */
export function selectTestEvents<E extends Pick<FeedEvent, 'id' | 'display_number'>>(list: E[], ids: string[]): E[] {
  const want = new Set(ids.map((i) => i.toLowerCase()));
  return list.filter((e) => want.has(String(e.id).toLowerCase()) || want.has(String(e.display_number)));
}

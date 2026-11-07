import { describe, expect, it } from 'vitest';
import { lockDecision } from '../lib/state.mjs';

const now = Date.parse('2026-11-07T12:00:00Z');
const ctx = { now, pollSeconds: 120, host: 'new', pid: 1, isAlive: () => false };
const ago = (s) => new Date(now - s * 1000).toISOString();

describe('lockDecision', () => {
  it('takes an unreadable or missing lock', () => {
    expect(lockDecision(null, ctx).take).toBe(true);
  });
  it('keeps a fresh heartbeat of another host', () => {
    expect(lockDecision({ host: 'old', pid: 1, at: ago(60) }, ctx).take).toBe(false);
  });
  it('takes over another host once the heartbeat is older than 3 cycles plus margin, pid 1 notwithstanding', () => {
    expect(lockDecision({ host: 'old', pid: 1, at: ago(380) }, ctx).take).toBe(false);
    expect(lockDecision({ host: 'old', pid: 1, at: ago(400) }, ctx)).toEqual({ take: true, reason: 'stale' });
  });
  it('same host: a live other pid keeps it, a dead one is taken over', () => {
    expect(lockDecision({ host: 'new', pid: 7, at: ago(1) }, { ...ctx, isAlive: () => true }).take).toBe(false);
    expect(lockDecision({ host: 'new', pid: 7, at: ago(1) }, ctx).take).toBe(true);
  });
  it('our own pid is ours', () => {
    expect(lockDecision({ host: 'new', pid: 1, at: ago(1) }, { ...ctx, isAlive: () => true })).toEqual({ take: true, reason: 'own' });
  });
  it('an unparsable timestamp from another host is stale', () => {
    expect(lockDecision({ host: 'old', pid: 1, at: 'x' }, ctx).take).toBe(true);
  });
});

/**
 * Date and time of a session as the buyer reads it: the UTC instant rendered in
 * the VENUE's time zone (the order status and "My tickets" carry `timezone`).
 * Browser-safe: no Node imports.
 */
export const DEFAULT_ZONE = 'Asia/Jerusalem';

function zoneOrDefault(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_ZONE;
  }
}

/** "21 November 2026, 19:30" in the venue's zone, in the page language. */
export function formatWhen(startAt: string, tz: string | null | undefined, intl: string): string {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(intl.startsWith('en') ? 'en-GB' : intl, {
    timeZone: zoneOrDefault(tz),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

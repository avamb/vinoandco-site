/**
 * Build-time allow-list for event descriptions (spec 62 §3.1). The platform
 * already renders ART into safe HTML; this is the second line: only the tags
 * and attributes below survive, everything else is dropped (its text kept).
 */

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'blockquote', 'hr']);
const VOID = new Set(['br', 'hr']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'noscript']);

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function safeHref(raw: string): string | null {
  const v = raw.trim().replace(/&amp;/g, '&');
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  return null;
}

export function sanitizeHtml(input: string): string {
  let html = input;
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
  }
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  return html.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (slash) return VOID.has(tag) ? '' : `</${tag}>`;
    if (tag === 'a') {
      const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const href = m ? safeHref(m[2] ?? m[3] ?? m[4] ?? '') : null;
      return href ? `<a href="${escapeAttr(href)}" rel="noopener nofollow" target="_blank">` : '<a>';
    }
    return `<${tag}>`;
  });
}

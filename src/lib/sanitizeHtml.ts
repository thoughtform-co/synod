import DOMPurify from 'dompurify';

const ALLOWED_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

const QUOTE_HEADER_RE = /^(On .{10,80} wrote:|Van:|From:|Verzonden:|Sent:|Aan:|To:|Onderwerp:|Subject:|CC:|Date:|Datum:)/m;

/**
 * Strip quoted reply chains from HTML email bodies.
 * Removes Gmail quote divs, Outlook-style "From:/Sent:" blocks, and "> " prefixed lines.
 */
export function stripQuotedReply(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('.gmail_quote, .gmail_extra, .yahoo_quoted, [name="quote"]').forEach((el) => el.remove());

  doc.querySelectorAll('blockquote').forEach((bq) => {
    const prev = bq.previousElementSibling;
    if (prev && QUOTE_HEADER_RE.test(prev.textContent ?? '')) prev.remove();
    bq.remove();
  });

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    const text = el.textContent?.trim() ?? '';
    if (QUOTE_HEADER_RE.test(text) && el.children.length === 0) {
      let sibling = el.nextElementSibling;
      while (sibling) {
        const next = sibling.nextElementSibling;
        sibling.remove();
        sibling = next;
      }
      el.remove();
      break;
    }
  }

  return doc.body.innerHTML;
}

/**
 * Strip quoted reply chains from plain-text email bodies.
 */
export function stripQuotedReplyPlain(text: string): string {
  const lines = text.split('\n');
  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (QUOTE_HEADER_RE.test(line)) {
      cutIndex = i;
      break;
    }
    if (line.startsWith('>') && i > 0 && lines.slice(i, i + 3).every((l) => l.trim().startsWith('>'))) {
      cutIndex = i;
      break;
    }
  }

  return lines.slice(0, cutIndex).join('\n').trimEnd();
}

/**
 * Sanitize HTML for safe email body rendering.
 * Strict policy: no scripts, no unsafe styles, block remote tracking.
 * Links get rel="noopener noreferrer" and only https/http/mailto allowed.
 */
export function sanitizeHtml(html: string): string {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'A' && node.getAttribute('href')) {
      const href = node.getAttribute('href') ?? '';
      try {
        const u = new URL(href, 'https://example.com');
        if (!ALLOWED_LINK_PROTOCOLS.has(u.protocol)) {
          node.removeAttribute('href');
        }
      } catch {
        node.removeAttribute('href');
      }
    }
  });
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img',
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height'],
      ADD_ATTR: ['target', 'rel'],
      ADD_TAGS: [],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      SAFE_FOR_TEMPLATES: true,
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

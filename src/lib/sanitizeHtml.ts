import DOMPurify from 'dompurify';

const ALLOWED_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

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
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
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

/**
 * Subject-aware, quote-aware chunking for email bodies.
 * Preserves context (subject, from) in each chunk and splits on quote boundaries when possible.
 */

import type { EmailDocument, EmailChunk } from './types';

const MAX_CHUNK_CHARS = 4000;
const QUOTE_PATTERNS = [
  /^On\s+.+wrote:\s*$/m,
  /^From:\s*.+Sent:\s*.+To:\s*$/m,
  /^-{3,}\s*Original Message\s*-{3,}/im,
  /^_{3,}/m,
];

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findQuoteBoundary(text: string): number {
  let earliest = -1;
  for (const re of QUOTE_PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      if (earliest === -1 || m.index < earliest) earliest = m.index;
    }
  }
  return earliest;
}

/**
 * Split body into chunks. First chunk gets subject + top of body; subsequent chunks get body only.
 * Splits on quote boundaries when possible, else by size.
 */
export function chunkDocument(doc: EmailDocument): EmailChunk[] {
  const bodyText = doc.bodyText || stripHtml(doc.bodyHtml || '') || doc.snippet || '';
  const chunks: EmailChunk[] = [];
  const baseMeta = {
    accountId: doc.accountId,
    threadId: doc.threadId,
    messageId: doc.messageId,
    internalDate: doc.internalDate,
    from: doc.from,
    to: doc.to,
    subject: doc.subject,
    labelIds: doc.labelIds,
    attachmentsMeta: doc.attachmentsMeta,
    snippet: doc.snippet,
  };

  if (bodyText.length <= MAX_CHUNK_CHARS) {
    chunks.push({
      ...baseMeta,
      chunkId: `${doc.messageId}_0`,
      chunkIndex: 0,
      chunkKind: 'full',
      bodyText: bodyText.trim() || doc.snippet,
      bodyHtml: doc.bodyHtml,
    });
    return chunks;
  }

  const quoteAt = findQuoteBoundary(bodyText);
  const mainBody = quoteAt >= 0 ? bodyText.slice(0, quoteAt).trim() : bodyText;
  let offset = 0;
  let index = 0;

  while (offset < mainBody.length) {
    const slice = mainBody.slice(offset, offset + MAX_CHUNK_CHARS);
    const chunkText = slice.trim();
    if (chunkText.length > 0) {
      chunks.push({
        ...baseMeta,
        chunkId: `${doc.messageId}_${index}`,
        chunkIndex: index,
        chunkKind: 'body',
        bodyText: chunkText,
      });
      index += 1;
    }
    offset += MAX_CHUNK_CHARS;
  }

  if (chunks.length === 0) {
    chunks.push({
      ...baseMeta,
      chunkId: `${doc.messageId}_0`,
      chunkIndex: 0,
      chunkKind: 'full',
      bodyText: doc.snippet,
    });
  }

  return chunks;
}

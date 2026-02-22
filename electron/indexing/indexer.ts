/**
 * Ingestion orchestrator: normalize -> chunk -> categorize -> embed -> upsert.
 * Idempotent by (accountId, chunkId). Can be driven by sync events or backfill from local DB.
 */

import type { GmailMessage } from '../gmail';
import type { EmailDocument } from './types';
import { chunkDocument } from './chunker';
import { categorizeChunk } from './categorizer';
import { embedBatch } from './embedder';
import { upsertChunk, setCheckpoint, pushToDlq, isIndexingConfigured } from './postgresClient';
import {
  recordIngestionStart,
  recordIngestionEnd,
  recordEmbedLatencyMs,
  recordIndexSuccess,
  recordIndexFailure,
} from './metrics';

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function gmailMessageToDocument(accountId: string, m: GmailMessage): EmailDocument {
  const bodyText = m.bodyPlain ?? '';
  const bodyHtml = m.bodyHtml ?? '';
  return {
    accountId,
    threadId: m.threadId,
    messageId: m.id,
    internalDate: m.internalDate ?? 0,
    from: m.from ?? '',
    to: m.to ?? '',
    subject: m.subject ?? '',
    bodyText,
    bodyHtml,
    labelIds: m.labelIds ?? [],
    attachmentsMeta: (m.attachments ?? []).map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    })),
    snippet: m.snippet ?? '',
  };
}

/**
 * Index a single thread's messages (idempotent). No-op when Postgres is not configured.
 */
export async function indexThread(
  accountId: string,
  messages: GmailMessage[]
): Promise<{ indexed: number; failed: number }> {
  if (!isIndexingConfigured()) return { indexed: 0, failed: 0 };
  recordIngestionStart();
  let indexed = 0;
  let failed = 0;
  for (const m of messages) {
    try {
      const doc = gmailMessageToDocument(accountId, m);
      const chunks = chunkDocument(doc);
      const categorized = chunks.map((c) => categorizeChunk(c));
      const texts = categorized.map(
        (c) => `${c.subject}\n${c.from}\n${c.bodyText}`.slice(0, 32000)
      );
      const embedStart = Date.now();
      const embeddings = await withRetry(() => embedBatch(texts));
      recordEmbedLatencyMs(Date.now() - embedStart);
      for (let i = 0; i < categorized.length; i++) {
        await withRetry(() => upsertChunk(categorized[i], embeddings[i]));
        indexed++;
      }
      recordIndexSuccess(categorized.length);
      const last = messages[messages.length - 1];
      if (last && last.id === m.id && last.internalDate) {
        await setCheckpoint(accountId, m.id, last.internalDate);
      }
    } catch (e) {
      failed++;
      recordIndexFailure(1);
      await pushToDlq(
        accountId,
        m.id,
        { threadId: m.threadId, subject: m.subject },
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  recordIngestionEnd();
  return { indexed, failed };
}

/**
 * Index messages in batches for backfill. Call with messages from local DB or API.
 */
export async function indexMessagesBatched(
  accountId: string,
  messages: GmailMessage[]
): Promise<{ indexed: number; failed: number }> {
  if (!isIndexingConfigured()) return { indexed: 0, failed: 0 };
  let indexed = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const result = await indexThread(accountId, batch);
    indexed += result.indexed;
    failed += result.failed;
  }
  return { indexed, failed };
}

export { isIndexingConfigured };

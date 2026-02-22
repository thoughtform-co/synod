/**
 * Postgres + pgvector client for mail chunks and embeddings.
 * Lazy connect; all operations no-op when INDEXING_POSTGRES_URL is not set.
 */

import type { CategorizedChunk } from './types';
import { EMBEDDING_DIMENSION } from './embedder';

let client: import('pg').Client | null = null;

function getConnectionString(): string | null {
  return process.env.INDEXING_POSTGRES_URL ?? null;
}

export function isIndexingConfigured(): boolean {
  return !!getConnectionString();
}

export async function getPgClient(): Promise<import('pg').Client | null> {
  const url = getConnectionString();
  if (!url) return null;
  if (client) return client;
  const { Client } = await import('pg');
  client = new Client({ connectionString: url });
  await client.connect();
  await ensureSchema(client);
  return client;
}

async function getClient(): Promise<import('pg').Client | null> {
  return getPgClient();
}

async function ensureSchema(pg: import('pg').Client): Promise<void> {
  await pg.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pg.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS mail_docs (
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      internal_date BIGINT NOT NULL,
      from_addr TEXT,
      to_addr TEXT,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      label_ids JSONB NOT NULL DEFAULT '[]',
      attachments_meta JSONB NOT NULL DEFAULT '[]',
      snippet TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      priority_score REAL NOT NULL DEFAULT 0,
      subscription_fingerprint TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, message_id)
    )
  `);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS mail_chunks (
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      internal_date BIGINT NOT NULL,
      from_addr TEXT,
      to_addr TEXT,
      subject TEXT,
      body_text TEXT NOT NULL,
      chunk_index INT NOT NULL DEFAULT 0,
      chunk_kind TEXT NOT NULL DEFAULT 'full',
      category TEXT NOT NULL DEFAULT 'other',
      priority_score REAL NOT NULL DEFAULT 0,
      subscription_fingerprint TEXT,
      embedding vector(${EMBEDDING_DIMENSION}),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, chunk_id)
    )
  `);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS indexing_checkpoints (
      account_id TEXT NOT NULL PRIMARY KEY,
      last_message_id TEXT,
      last_internal_date BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS indexing_dlq (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      payload JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function upsertChunk(
  chunk: CategorizedChunk,
  embedding: number[]
): Promise<void> {
  const pg = await getClient();
  if (!pg) return;
  const now = new Date().toISOString();
  await pg.query(
    `INSERT INTO mail_chunks (
      account_id, message_id, chunk_id, thread_id, internal_date,
      from_addr, to_addr, subject, body_text, chunk_index, chunk_kind,
      category, priority_score, subscription_fingerprint, embedding, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::vector, $16)
    ON CONFLICT (account_id, chunk_id) DO UPDATE SET
      thread_id = EXCLUDED.thread_id,
      internal_date = EXCLUDED.internal_date,
      from_addr = EXCLUDED.from_addr,
      to_addr = EXCLUDED.to_addr,
      subject = EXCLUDED.subject,
      body_text = EXCLUDED.body_text,
      chunk_index = EXCLUDED.chunk_index,
      chunk_kind = EXCLUDED.chunk_kind,
      category = EXCLUDED.category,
      priority_score = EXCLUDED.priority_score,
      subscription_fingerprint = EXCLUDED.subscription_fingerprint,
      embedding = EXCLUDED.embedding,
      updated_at = EXCLUDED.updated_at`,
    [
      chunk.accountId,
      chunk.messageId,
      chunk.chunkId,
      chunk.threadId,
      chunk.internalDate,
      chunk.from || null,
      chunk.to || null,
      chunk.subject || null,
      chunk.bodyText,
      chunk.chunkIndex,
      chunk.chunkKind,
      chunk.category,
      chunk.priorityScore,
      chunk.subscriptionFingerprint ?? null,
      `[${embedding.join(',')}]`,
      now,
    ]
  );
}

export async function setCheckpoint(
  accountId: string,
  lastMessageId: string,
  lastInternalDate: number
): Promise<void> {
  const pg = await getClient();
  if (!pg) return;
  const now = new Date().toISOString();
  await pg.query(
    `INSERT INTO indexing_checkpoints (account_id, last_message_id, last_internal_date, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id) DO UPDATE SET
       last_message_id = EXCLUDED.last_message_id,
       last_internal_date = EXCLUDED.last_internal_date,
       updated_at = EXCLUDED.updated_at`,
    [accountId, lastMessageId, lastInternalDate, now]
  );
}

export async function pushToDlq(
  accountId: string,
  messageId: string,
  payload: unknown,
  error: string
): Promise<void> {
  const pg = await getClient();
  if (!pg) return;
  await pg.query(
    `INSERT INTO indexing_dlq (account_id, message_id, payload, error) VALUES ($1, $2, $3, $4)`,
    [accountId, messageId, JSON.stringify(payload), error]
  );
}

/**
 * Purge all indexed data for an account (chunks, docs, checkpoints). DLQ entries are kept.
 */
export async function purgeAccount(accountId: string): Promise<void> {
  const pg = await getClient();
  if (!pg) return;
  await pg.query('DELETE FROM mail_chunks WHERE account_id = $1', [accountId]);
  await pg.query('DELETE FROM mail_docs WHERE account_id = $1', [accountId]);
  await pg.query('DELETE FROM indexing_checkpoints WHERE account_id = $1', [accountId]);
}

export async function closePostgres(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

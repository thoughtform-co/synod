/**
 * Dual search: keyword (FTS) and semantic (vector) with optional hybrid ranking.
 */

import { embedText } from '../indexing/embedder';
import type { SearchResult } from '../indexing/types';
import type { EmailCategory } from '../indexing/types';
import { recordKeywordQueryLatencyMs, recordSemanticQueryLatencyMs } from '../indexing/metrics';

let client: import('pg').Client | null = null;

function getConnectionString(): string | null {
  return process.env.INDEXING_POSTGRES_URL ?? null;
}

async function getClient(): Promise<import('pg').Client | null> {
  const url = getConnectionString();
  if (!url) return null;
  if (client) return client;
  const { Client } = await import('pg');
  client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

export function isSearchConfigured(): boolean {
  return !!getConnectionString();
}

const DEFAULT_LIMIT = 50;
const RECENCY_DECAY_DAYS = 90;

function recencyBoost(internalDate: number): number {
  const ageDays = (Date.now() - internalDate) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.5;
  if (ageDays <= 7) return 1.2;
  if (ageDays <= 30) return 1;
  if (ageDays <= RECENCY_DECAY_DAYS) return 0.8;
  return 0.5;
}

function rowToResult(r: {
  chunk_id: string;
  message_id: string;
  thread_id: string;
  account_id: string;
  subject: string | null;
  from_addr: string | null;
  body_text: string;
  internal_date: string;
  category: string;
  priority_score: number;
  score?: number;
  explanation?: string | null;
}): SearchResult {
  const internalDate = parseInt(r.internal_date, 10) || 0;
  return {
    chunkId: r.chunk_id,
    messageId: r.message_id,
    threadId: r.thread_id,
    accountId: r.account_id,
    subject: r.subject ?? '',
    from: r.from_addr ?? '',
    snippet: r.body_text.slice(0, 200),
    internalDate,
    category: r.category as EmailCategory,
    score: r.score ?? 0,
    explanation: r.explanation ?? undefined,
  };
}

/**
 * Keyword search using Postgres full-text search. Fast path.
 */
export async function keywordSearch(
  accountIds: string[],
  query: string,
  limit: number = DEFAULT_LIMIT,
  category?: EmailCategory
): Promise<SearchResult[]> {
  const pg = await getClient();
  if (!pg) return [];
  if (!query.trim()) return [];

  const tsQuery = query.trim();
  const recencyTs = Date.now() - RECENCY_DECAY_DAYS * 24 * 60 * 60 * 1000;
  const params: (string | string[] | number)[] = [tsQuery];
  let idx = 2;
  if (accountIds.length > 0) {
    params.push(accountIds);
    idx++;
  }
  if (category) {
    params.push(category);
    idx++;
  }
  params.push(recencyTs, limit);
  const accountFilter = accountIds.length > 0 ? `AND account_id = ANY($2)` : '';
  const categoryFilter = category
    ? `AND category = $${accountIds.length > 0 ? 3 : 2}`
    : '';
  const limitParam = idx + 1;

  const t0 = Date.now();
  const res = await pg.query(
    `SELECT chunk_id, message_id, thread_id, account_id, subject, from_addr, body_text,
            internal_date::text, category, priority_score,
            ts_rank(
              to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(from_addr,'') || ' ' || coalesce(body_text,'')),
              plainto_tsquery('english', $1)
            ) as score,
            'keyword match' as explanation
     FROM mail_chunks
     WHERE to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(from_addr,'') || ' ' || coalesce(body_text,''))
           @@ plainto_tsquery('english', $1)
           ${accountFilter}
           ${categoryFilter}
     ORDER BY (ts_rank(to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(from_addr,'') || ' ' || coalesce(body_text,'')), plainto_tsquery('english', $1)) * priority_score) DESC
     LIMIT $${limitParam}`,
    params
  );
  recordKeywordQueryLatencyMs(Date.now() - t0);

  return res.rows.map((r) => {
    const internalDate = parseInt(r.internal_date, 10) || 0;
    const score =
      (Number(r.score) || 0) * (r.priority_score || 0.2) * recencyBoost(internalDate);
    return rowToResult({ ...r, score });
  });
}

/**
 * Semantic search using embedding similarity. Requires Voyage API key.
 */
export async function semanticSearch(
  accountIds: string[],
  query: string,
  limit: number = DEFAULT_LIMIT,
  category?: EmailCategory
): Promise<SearchResult[]> {
  const pg = await getClient();
  if (!pg) return [];
  if (!query.trim()) return [];

  const embedT0 = Date.now();
  const embedding = await embedText(query);
  const isStub = embedding.every((x) => x === 0);
  if (isStub) return [];

  const params: (string | string[] | number)[] = [`[${embedding.join(',')}]`];
  let limitParam = 2;
  if (accountIds.length > 0) {
    params.push(accountIds);
    limitParam++;
  }
  if (category) {
    params.push(category);
    limitParam++;
  }
  params.push(limit);
  const accountFilter = accountIds.length > 0 ? `AND account_id = ANY($2)` : '';
  const categoryFilter = category
    ? `AND category = $${accountIds.length > 0 ? 3 : 2}`
    : '';

  const res = await pg.query(
    `SELECT chunk_id, message_id, thread_id, account_id, subject, from_addr, body_text,
            internal_date::text, category, priority_score,
            (1 - (embedding <=> $1::vector)) as score,
            'semantic similarity' as explanation
     FROM mail_chunks
     WHERE embedding IS NOT NULL ${accountFilter} ${categoryFilter}
     ORDER BY embedding <=> $1::vector
     LIMIT $${limitParam}`,
    params
  );
  recordSemanticQueryLatencyMs(Date.now() - embedT0); // full request: embed + vector query

  return res.rows.map((r) => {
    const internalDate = parseInt(r.internal_date, 10) || 0;
    const score = (Number(r.score) || 0) * (r.priority_score || 0.2) * recencyBoost(internalDate);
    return rowToResult({ ...r, score });
  });
}

/**
 * Hybrid: run both keyword and semantic, merge and re-rank by combined score.
 */
export async function hybridSearch(
  accountIds: string[],
  query: string,
  limit: number = DEFAULT_LIMIT,
  category?: EmailCategory
): Promise<SearchResult[]> {
  const [kw, sem] = await Promise.all([
    keywordSearch(accountIds, query, limit * 2, category),
    semanticSearch(accountIds, query, limit * 2, category),
  ]);
  const byChunkId = new Map<string, SearchResult>();
  for (const r of kw) {
    byChunkId.set(r.chunkId, { ...r, score: r.score * 0.5, explanation: 'keyword + semantic' });
  }
  for (const r of sem) {
    const existing = byChunkId.get(r.chunkId);
    if (existing) {
      existing.score += r.score * 0.5;
    } else {
      byChunkId.set(r.chunkId, { ...r, score: r.score * 0.5, explanation: 'keyword + semantic' });
    }
  }
  return [...byChunkId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

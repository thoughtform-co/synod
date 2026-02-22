-- Cloud Mail Intelligence: Postgres + pgvector schema
-- Run against your cloud Postgres instance (with pgvector extension).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Raw email documents (one row per message)
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
);

CREATE INDEX IF NOT EXISTS idx_mail_docs_account ON mail_docs(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_docs_thread ON mail_docs(account_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_docs_internal_date ON mail_docs(internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_docs_category ON mail_docs(category);
CREATE INDEX IF NOT EXISTS idx_mail_docs_priority ON mail_docs(priority_score DESC);

-- Chunks with embeddings and FTS (chunk_id = message_id + '_' + chunk_index)
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
  embedding vector(1024),
  fts_doc tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(from_addr, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_chunks_thread ON mail_chunks(account_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_chunks_internal_date ON mail_chunks(internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_chunks_category ON mail_chunks(category);
CREATE INDEX IF NOT EXISTS idx_mail_chunks_fts ON mail_chunks USING GIN(fts_doc);

-- pgvector ANN index (use when table is populated)
-- CREATE INDEX IF NOT EXISTS idx_mail_chunks_embedding ON mail_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Ingestion checkpoint per account (resumable backfill)
CREATE TABLE IF NOT EXISTS indexing_checkpoints (
  account_id TEXT NOT NULL PRIMARY KEY,
  last_message_id TEXT,
  last_internal_date BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dead-letter queue for failed indexing
CREATE TABLE IF NOT EXISTS indexing_dlq (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  payload JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indexing_dlq_account ON indexing_dlq(account_id);

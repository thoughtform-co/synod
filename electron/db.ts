import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

let db: Database.Database | null = null;
let stmtKvGet: Database.Statement | null = null;
let stmtKvSet: Database.Statement | null = null;
let stmtKvDelete: Database.Statement | null = null;

export function initDb(): void {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'synod.db');
  db = new Database(dbPath);
  stmtKvGet = db.prepare('SELECT value FROM kv WHERE key = ?');
  stmtKvSet = db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)');
  stmtKvDelete = db.prepare('DELETE FROM kv WHERE key = ?');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      tokens TEXT NOT NULL,
      scopes TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_state (
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      cursor TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, kind),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at ON sync_state(updated_at);
  `);

  runMigrations(db);
}

/** Mail cache tables (migration v2). Thread and message data for local-first UI. */
function createMailCacheTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      snippet TEXT NOT NULL DEFAULT '',
      subject TEXT,
      from_name TEXT,
      history_id TEXT,
      label_ids TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, thread_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      from_addr TEXT,
      to_addr TEXT,
      subject TEXT,
      date TEXT,
      snippet TEXT,
      body_plain TEXT,
      body_html TEXT,
      label_ids TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, message_id),
      FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, thread_id)
    );
    CREATE TABLE IF NOT EXISTS thread_labels (
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (account_id, thread_id, label_id),
      FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, thread_id)
    );
    CREATE INDEX IF NOT EXISTS idx_threads_account_updated ON threads(account_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_thread_labels_account_label ON thread_labels(account_id, label_id);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_id);
  `);
}

const SCHEMA_VERSION_KEY = 'schema_version';

function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isFinite(n) ? n : 0;
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(SCHEMA_VERSION_KEY, String(version));
}

/** Versioned migrations. Add new migrations when schema changes. */
function runMigrations(db: Database.Database): void {
  let v = getSchemaVersion(db);
  if (v < 1) {
    migrateLegacyAccount(db);
    setSchemaVersion(db, 1);
    v = 1;
  }
  if (v < 2) {
    createMailCacheTables(db);
    setSchemaVersion(db, 2);
    v = 2;
  }
  if (v < 3) {
    db.exec('ALTER TABLE messages ADD COLUMN internal_date INTEGER');
    setSchemaVersion(db, 3);
    v = 3;
  }
  if (v < 4) {
    db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT');
    setSchemaVersion(db, 4);
  }
}

/** Migration 1: legacy single account (kv.account) to active_account + accounts_order. */
function migrateLegacyAccount(db: Database.Database): void {
  const hasActive = db.prepare('SELECT 1 FROM kv WHERE key = ?').get('active_account');
  const hasOrder = db.prepare('SELECT 1 FROM kv WHERE key = ?').get('accounts_order');
  if (hasActive && hasOrder) return;

  const legacyRow = db.prepare('SELECT value FROM kv WHERE key = ?').get('account') as { value: string } | undefined;
  if (legacyRow) {
    try {
      const legacy = JSON.parse(legacyRow.value) as { email?: string };
      const email = legacy?.email;
      if (email && typeof email === 'string') {
        if (!hasActive) {
          db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('active_account', JSON.stringify(email));
        }
        if (!hasOrder) {
          db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('accounts_order', JSON.stringify([email]));
        }
      }
    } catch {
      // ignore parse errors
    }
  }
}

export function getDb(): Database.Database | null {
  return db;
}

/** Cached prepared statement: get kv value by key. */
export function getKv(key: string): string | null {
  if (!stmtKvGet) return null;
  const row = stmtKvGet.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** Cached prepared statement: set kv value. */
export function setKv(key: string, value: string): void {
  stmtKvSet?.run(key, value);
}

/** Cached prepared statement: delete kv by key. */
export function deleteKv(key: string): void {
  stmtKvDelete?.run(key);
}

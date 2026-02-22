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
  const v = getSchemaVersion(db);
  if (v < 1) {
    migrateLegacyAccount(db);
    setSchemaVersion(db, 1);
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

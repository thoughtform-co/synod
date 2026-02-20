import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

let db: Database.Database | null = null;

export function initDb(): void {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'synod.db');
  db = new Database(dbPath);

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
  `);

  runMigration(db);
}

/** Migrate legacy single account (kv.account) to active_account + accounts_order. */
function runMigration(db: Database.Database): void {
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

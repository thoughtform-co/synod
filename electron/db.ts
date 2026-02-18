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
}

export function getDb(): Database.Database | null {
  return db;
}

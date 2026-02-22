/**
 * OS keychain-backed storage for OAuth client secret. Uses Electron safeStorage
 * so secrets are encrypted at rest (DPAPI on Windows, Keychain on macOS, etc.).
 */

import { safeStorage } from 'electron';
import { getDb } from './db';

const SECRET_KEYS = ['google_client_secret'] as const;
const ENC_SUFFIX = '_encrypted';

function getEncKey(key: string): string {
  return key + ENC_SUFFIX;
}

/**
 * Migrate plaintext secret from kv into encrypted storage, then remove plaintext.
 */
function migratePlaintextSecret(db: import('better-sqlite3').Database, key: string): void {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row?.value || !safeStorage.isEncryptionAvailable()) return;
  try {
    const encrypted = safeStorage.encryptString(row.value);
    const encKey = getEncKey(key);
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(encKey, encrypted.toString('base64'));
    db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  } catch {
    // Leave plaintext in place if encryption fails
  }
}

/**
 * Run once after DB init to migrate any plaintext secrets to encrypted storage.
 */
export function migrateSecretsFromPlaintext(): void {
  const db = getDb();
  if (!db) return;
  for (const key of SECRET_KEYS) {
    const hasEnc = db.prepare('SELECT 1 FROM kv WHERE key = ?').get(getEncKey(key));
    if (hasEnc) continue;
    migratePlaintextSecret(db, key);
  }
}

/**
 * Store a secret in encrypted form in kv.
 */
export function setSecret(key: string, value: string): void {
  if (!SECRET_KEYS.includes(key as (typeof SECRET_KEYS)[number])) return;
  const db = getDb();
  if (!db) return;
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(value);
  const encKey = getEncKey(key);
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(encKey, encrypted.toString('base64'));
  db.prepare('DELETE FROM kv WHERE key = ?').run(key);
}

/**
 * Retrieve and decrypt a secret. Returns null if missing or decryption fails.
 */
export function getSecret(key: string): string | null {
  if (!SECRET_KEYS.includes(key as (typeof SECRET_KEYS)[number])) return null;
  const db = getDb();
  if (!db) return null;
  migratePlaintextSecret(db, key);
  const encKey = getEncKey(key);
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(encKey) as { value: string } | undefined;
  if (!row?.value) {
    const plainRow = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return plainRow?.value ?? null;
  }
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = Buffer.from(row.value, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

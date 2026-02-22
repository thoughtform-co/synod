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
 * Unwrap a value that may have been stored via JSON.stringify (old format has
 * literal quotes around strings, e.g. `"the-secret"`). New format stores raw.
 */
function unwrapJsonString(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return JSON.parse(raw) as string; } catch { /* not valid JSON, use as-is */ }
  }
  return raw;
}

/**
 * Migrate plaintext secret from kv into encrypted storage. We keep plaintext as
 * fallback so token refresh still works if decryption fails (e.g. different user context).
 * The plaintext DB value may be JSON-stringified (old format); we unwrap before encrypting
 * so the encrypted value stores the raw secret.
 */
function migratePlaintextSecret(db: import('better-sqlite3').Database, key: string): void {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row?.value || !safeStorage.isEncryptionAvailable()) return;
  try {
    const rawSecret = unwrapJsonString(row.value);
    const encrypted = safeStorage.encryptString(rawSecret);
    const encKey = getEncKey(key);
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(encKey, encrypted.toString('base64'));
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
    // Always re-migrate: the encrypted copy may contain a stale JSON-wrapped value
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
  if (!safeStorage.isEncryptionAvailable()) {
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
    return;
  }
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
  const plainRow = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(encKey) as { value: string } | undefined;
  if (row?.value && safeStorage.isEncryptionAvailable()) {
    try {
      const buf = Buffer.from(row.value, 'base64');
      return safeStorage.decryptString(buf);
    } catch {
      // Decryption failed; fall back to plaintext
    }
  }
  // Plaintext may be JSON-stringified (old format `"secret"`); unwrap it
  if (plainRow?.value) return unwrapJsonString(plainRow.value);
  return null;
}

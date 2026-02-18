import { storeGet, storeSet } from '@/lib/db/sqlite';

const KEY_ACCOUNT = 'account';
const KEY_TOKENS_CACHED = 'tokens_cached';

export interface AccountInfo {
  email: string;
}

export async function getStoredAccount(): Promise<AccountInfo | null> {
  const raw = await storeGet<AccountInfo>(KEY_ACCOUNT);
  return raw ?? null;
}

export async function setStoredAccount(account: AccountInfo): Promise<void> {
  await storeSet(KEY_ACCOUNT, account);
}

export async function clearStoredAccount(): Promise<void> {
  await storeSet(KEY_ACCOUNT, null);
}

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
}

export function getGoogleClientSecret(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? '';
}

export function hasGoogleEnv(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

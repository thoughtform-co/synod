import { storeGet, storeSet } from '@/lib/db/sqlite';

const KEY_ACCOUNT = 'account';
const KEY_ACTIVE_ACCOUNT = 'active_account';

export interface AccountInfo {
  email: string;
}

/** Active account id (email). Prefers active_account, fallback to legacy account.email for one release. */
export async function getActiveAccountId(): Promise<string | null> {
  const active = await storeGet<string>(KEY_ACTIVE_ACCOUNT);
  if (active && typeof active === 'string') return active;
  const legacy = await storeGet<AccountInfo>(KEY_ACCOUNT);
  return legacy?.email && typeof legacy.email === 'string' ? legacy.email : null;
}

export async function getStoredAccount(): Promise<AccountInfo | null> {
  const activeId = await getActiveAccountId();
  return activeId ? { email: activeId } : null;
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

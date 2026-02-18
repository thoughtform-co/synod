/**
 * Renderer-side access to persisted key-value store.
 * Actual SQLite runs in the main process; preload exposes store get/set via IPC.
 */

function getAPI(): Window['electronAPI'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI;
}

export async function storeGet<T = unknown>(key: string): Promise<T | null> {
  const api = getAPI();
  if (!api?.store?.get) return null;
  const value = await api.store.get(key);
  return value as T | null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const api = getAPI();
  if (!api?.store?.set) return;
  await api.store.set(key, value);
}

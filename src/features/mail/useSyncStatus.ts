import { useEffect, useState } from 'react';
import type { SyncStatus } from '@/vite-env';

/** Subscribe to main-process sync status. Returns current status and refetch trigger. */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>('idle');
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.sync : undefined;
    if (!api?.onStatus) return undefined;
    const unsubscribe = api.onStatus((s) => setStatus(s as SyncStatus));
    return unsubscribe;
  }, []);
  return status;
}

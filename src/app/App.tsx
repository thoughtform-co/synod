import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectGoogleAccountView } from '@/features/auth/ConnectGoogleAccountView';
import { getStoredAccount } from '@/features/auth/authStore';
import { storeGet } from '@/lib/db/sqlite';

export type BaseTheme = 'dark' | 'light';

export function applyTheme(base: BaseTheme) {
  const root = document.documentElement;
  root.classList.toggle('light', base === 'light');
}

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    storeGet<BaseTheme>('theme').then((savedTheme) => {
      const base: BaseTheme = savedTheme === 'light' ? 'light' : 'dark';
      applyTheme(base);
    });
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    getStoredAccount().then((a) => {
      setAccount(a);
      setChecking(false);
    });
  }, [mounted]);

  if (!mounted || checking) {
    return (
      <div className="synod-loading">
        <span className="synod-loading__text">Synod</span>
      </div>
    );
  }

  if (!account?.email) {
    return (
      <ErrorBoundary>
        <div className="synod-app">
          <ConnectGoogleAccountView
            onConnected={() => getStoredAccount().then((a) => setAccount(a))}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="synod-app">
        <AppShell />
      </div>
    </ErrorBoundary>
  );
}

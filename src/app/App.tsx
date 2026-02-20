import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectGoogleAccountView } from '@/features/auth/ConnectGoogleAccountView';
import { getStoredAccount } from '@/features/auth/authStore';
import { storeGet } from '@/lib/db/sqlite';

export type ThemeMode = 'dark' | 'light' | 'atreides';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('light', mode === 'light');
  root.classList.toggle('atreides', mode === 'atreides');
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
    storeGet<ThemeMode>('theme').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'atreides') applyTheme(saved);
      else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) applyTheme('light');
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
      <div className="synod-app">
        <ConnectGoogleAccountView
          onConnected={() => getStoredAccount().then((a) => setAccount(a))}
        />
      </div>
    );
  }

  return (
    <div className="synod-app">
      <AppShell />
    </div>
  );
}

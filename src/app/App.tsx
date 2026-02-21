import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ConnectGoogleAccountView } from '@/features/auth/ConnectGoogleAccountView';
import { getStoredAccount } from '@/features/auth/authStore';
import { storeGet } from '@/lib/db/sqlite';

export type BaseTheme = 'dark' | 'light';

export function applyTheme(base: BaseTheme, atreides: boolean) {
  const root = document.documentElement;
  root.classList.toggle('light', base === 'light');
  root.classList.toggle('atreides', atreides);
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
    Promise.all([
      storeGet<BaseTheme>('theme'),
      storeGet<boolean>('atreides'),
    ]).then(([savedTheme, savedAtreides]) => {
      const base: BaseTheme = savedTheme === 'light' ? 'light' : 'dark';
      const atreides = savedAtreides === true;
      applyTheme(base, atreides);
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

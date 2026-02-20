import { useEffect, useState } from 'react';
import { Sun, Moon, Leaf, Clock, Keyboard, Users } from 'lucide-react';
import type { ThemeMode } from '@/app/App';
import { storeGet, storeSet } from '@/lib/db/sqlite';
import type { AccountsListResult } from '@/vite-env.d';
import { connectGoogleAccount } from '@/features/auth/googleOAuth';
import { getGoogleClientId, getGoogleClientSecret } from '@/features/auth/authStore';

const SHORTCUTS = [
  { key: 'E', action: 'Done (archive + mark read)' },
  { key: 'R', action: 'Reply' },
  { key: 'A', action: 'Reply all' },
  { key: 'T', action: 'Reminder' },
] as const;

interface SettingsPanelProps {
  onClose: () => void;
  onAccountsChange?: () => void;
}

export function SettingsPanel({ onClose, onAccountsChange }: SettingsPanelProps) {
  const [accountsResult, setAccountsResult] = useState<AccountsListResult | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [reminderMins, setReminderMins] = useState(15);
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    window.electronAPI?.accounts?.list().then(setAccountsResult);
  }, []);

  useEffect(() => {
    storeGet<ThemeMode>('theme').then((t) => {
      if (t === 'dark' || t === 'light' || t === 'atreides') setTheme(t);
    });
  }, []);

  useEffect(() => {
    window.electronAPI?.reminder?.getMinutes().then((m) => setReminderMins(m));
  }, []);

  const handleThemeChange = (next: ThemeMode) => {
    setTheme(next);
    storeSet('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
    document.documentElement.classList.toggle('atreides', next === 'atreides');
  };

  const handleReminderChange = (mins: number) => {
    setReminderMins(mins);
    window.electronAPI?.reminder?.setMinutes(mins);
  };

  const handleSetActive = (accountId: string) => {
    window.electronAPI?.accounts?.setActive(accountId).then(() => {
      window.electronAPI?.accounts?.list().then(setAccountsResult);
      onAccountsChange?.();
    });
  };

  const handleRemoveAccount = (accountId: string) => {
    if (!window.confirm(`Remove this account? You can add it again later.`)) return;
    window.electronAPI?.accounts?.remove(accountId).then(() => {
      window.electronAPI?.accounts?.list().then(setAccountsResult);
      onAccountsChange?.();
    });
  };

  const handleAddAccount = async () => {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) {
      alert('Google OAuth credentials not configured. Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in .env');
      return;
    }
    setAddingAccount(true);
    try {
      await connectGoogleAccount(clientId, clientSecret);
      window.electronAPI?.accounts?.list().then(setAccountsResult);
      onAccountsChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add account');
    } finally {
      setAddingAccount(false);
    }
  };

  const accounts = accountsResult?.accounts ?? [];
  const activeId = accountsResult?.activeId ?? null;

  return (
    <div className="shell-settings-overlay" role="dialog" aria-label="Settings" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="shell-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shell-settings-panel__head">
          <h2 className="shell-settings-panel__title">Settings</h2>
          <button type="button" className="shell-settings-panel__close" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="settings-section" aria-labelledby="settings-accounts">
          <h3 id="settings-accounts" className="settings-section__title">
            <Users size={14} strokeWidth={1.5} />
            Accounts
          </h3>
          <ul className="settings-accounts-list">
            {accounts.map((acc) => (
              <li key={acc.id} className="settings-accounts-item">
                <span className="settings-accounts-item__email">{acc.email}</span>
                {activeId === acc.id && <span className="settings-accounts-item__badge">Active</span>}
                {activeId !== acc.id && (
                  <button type="button" className="settings-accounts-item__btn" onClick={() => handleSetActive(acc.id)}>
                    Switch
                  </button>
                )}
                <button type="button" className="settings-accounts-item__btn settings-accounts-item__btn--danger" onClick={() => handleRemoveAccount(acc.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="settings-section__action" onClick={handleAddAccount} disabled={addingAccount}>
            {addingAccount ? 'Adding…' : 'Add account'}
          </button>
        </section>

        <section className="settings-section" aria-labelledby="settings-shortcuts">
          <h3 id="settings-shortcuts" className="settings-section__title">
            <Keyboard size={14} strokeWidth={1.5} />
            Shortcuts
          </h3>
          <dl className="settings-shortcuts-list">
            {SHORTCUTS.map(({ key, action }) => (
              <div key={key} className="settings-shortcuts-row">
                <dt className="settings-shortcuts-key">{key}</dt>
                <dd className="settings-shortcuts-action">{action}</dd>
              </div>
            ))}
          </dl>
          <p className="settings-section__hint">Shortcuts are disabled while typing in reply or other inputs.</p>
        </section>

        <section className="settings-section" aria-labelledby="settings-reminder">
          <h3 id="settings-reminder" className="settings-section__title">
            <Clock size={14} strokeWidth={1.5} />
            Reminder default
          </h3>
          <select
            className="settings-section__select"
            value={reminderMins}
            onChange={(e) => handleReminderChange(Number(e.target.value))}
          >
            <option value={5}>5 min before</option>
            <option value={10}>10 min before</option>
            <option value={15}>15 min before</option>
            <option value={30}>30 min before</option>
            <option value={60}>1 hour before</option>
          </select>
        </section>

        <section className="settings-section" aria-labelledby="settings-theme">
          <h3 id="settings-theme" className="settings-section__title">
            {theme === 'dark' && <Moon size={14} strokeWidth={1.5} />}
            {theme === 'light' && <Sun size={14} strokeWidth={1.5} />}
            {theme === 'atreides' && <Leaf size={14} strokeWidth={1.5} />}
            Theme
          </h3>
          <div className="settings-theme-toggle">
            <button
              type="button"
              className={`settings-theme-btn ${theme === 'dark' ? 'settings-theme-btn--active' : ''}`}
              onClick={() => handleThemeChange('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={`settings-theme-btn ${theme === 'light' ? 'settings-theme-btn--active' : ''}`}
              onClick={() => handleThemeChange('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`settings-theme-btn ${theme === 'atreides' ? 'settings-theme-btn--active' : ''}`}
              onClick={() => handleThemeChange('atreides')}
            >
              Atreides
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

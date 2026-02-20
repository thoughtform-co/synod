import { useState, useEffect, useCallback } from 'react';
import { Mail, CalendarDays, Sun, Moon } from 'lucide-react';
import { MailSidebar } from '@/features/mail/components/MailSidebar';
import { ThreadList } from '@/features/mail/components/ThreadList';
import { ThreadView } from '@/features/mail/components/ThreadView';
import { CalendarView } from '@/features/calendar/components/CalendarView';
import { storeGet, storeSet } from '@/lib/db/sqlite';
import type { AccountsListResult } from '@/vite-env.d';
import type { MailView } from '@/features/mail/mailRepository';
import { connectGoogleAccount } from '@/features/auth/googleOAuth';
import { getGoogleClientId, getGoogleClientSecret } from '@/features/auth/authStore';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

type Tab = 'mail' | 'calendar';

const DEFAULT_MAIL_VIEW: MailView = { type: 'label', labelId: 'INBOX' };

export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('mail');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [accountsResult, setAccountsResult] = useState<AccountsListResult | null>(null);
  const [mailView, setMailView] = useState<MailView>(DEFAULT_MAIL_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refreshAccounts = useCallback(() => {
    if (!window.electronAPI?.accounts?.list) return;
    window.electronAPI.accounts.list().then(setAccountsResult);
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    storeGet<'light' | 'dark'>('theme').then((t) => {
      if (t) {
        setTheme(t);
        document.documentElement.classList.toggle('light', t === 'light');
      }
    });
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storeSet('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const handleSetActive = useCallback((accountId: string) => {
    window.electronAPI?.accounts?.setActive(accountId).then(refreshAccounts);
  }, [refreshAccounts]);

  const handleReorder = useCallback((orderedIds: string[]) => {
    window.electronAPI?.accounts?.reorder(orderedIds).then(refreshAccounts);
  }, [refreshAccounts]);

  const handleAddAccount = useCallback(async () => {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) {
      setSettingsOpen(true);
      return;
    }
    try {
      await connectGoogleAccount(clientId, clientSecret);
      refreshAccounts();
    } catch {
      setSettingsOpen(true);
    }
  }, [refreshAccounts]);

  const activeAccountId = accountsResult?.activeId ?? null;

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-bar__brand">Synod</div>

        <nav className="shell-bar__tabs">
          <button
            type="button"
            className={`shell-tab ${activeTab === 'mail' ? 'shell-tab--active' : ''}`}
            onClick={() => setActiveTab('mail')}
            aria-label="Mail"
          >
            <Mail size={18} strokeWidth={1.5} />
            <span className="shell-tab__label">Mail</span>
          </button>
          <button
            type="button"
            className={`shell-tab ${activeTab === 'calendar' ? 'shell-tab--active' : ''}`}
            onClick={() => setActiveTab('calendar')}
            aria-label="Calendar"
          >
            <CalendarDays size={18} strokeWidth={1.5} />
            <span className="shell-tab__label">Calendar</span>
          </button>
        </nav>

        <button
          type="button"
          className="shell-bar__theme"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
        </button>
      </header>

      {activeTab === 'mail' ? (
        <div className="shell-mail">
          <aside className="shell-mail__sidebar">
            <MailSidebar
              accountsResult={accountsResult}
              activeAccountId={activeAccountId}
              currentView={mailView}
              onSetActive={handleSetActive}
              onReorder={handleReorder}
              onViewChange={setMailView}
              onOpenSettings={() => setSettingsOpen(true)}
              onAddAccount={handleAddAccount}
              refreshAccounts={refreshAccounts}
            />
          </aside>
          <section className="shell-mail__list">
            <ThreadList
              activeAccountId={activeAccountId}
              mailView={mailView}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
            />
          </section>
          <main className="shell-mail__view">
            {selectedThreadId ? (
              <ThreadView
                threadId={selectedThreadId}
                activeAccountId={activeAccountId}
                onDone={() => setSelectedThreadId(null)}
                onDelete={() => setSelectedThreadId(null)}
              />
            ) : (
              <div className="shell-mail__empty">
                <p className="shell-mail__empty-text">Select a conversation</p>
              </div>
            )}
          </main>
        </div>
      ) : (
        <main className="shell-calendar">
          <CalendarView />
        </main>
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onAccountsChange={refreshAccounts}
        />
      )}
    </div>
  );
}

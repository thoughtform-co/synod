import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, CalendarDays, Sun, Moon, Minus, Square, X } from 'lucide-react';
import { type BaseTheme, applyTheme } from '@/app/App';
import { MailSidebar } from '@/features/mail/components/MailSidebar';
import { MailSearch } from '@/features/mail/components/MailSearch';
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

const PANEL_KEYS = { sidebar: 'sidebar_width', list: 'list_width' } as const;
const MIN_SIDEBAR = 140;
const MAX_SIDEBAR = 420;
const MIN_LIST = 220;
const MAX_LIST = 640;
const DEFAULT_SIDEBAR = 220;
const DEFAULT_LIST = 320;

export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('mail');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [removedThreadIds, setRemovedThreadIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<BaseTheme>('dark');
  const [accountsResult, setAccountsResult] = useState<AccountsListResult | null>(null);
  const [mailView, setMailView] = useState<MailView>(DEFAULT_MAIL_VIEW);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const [listWidth, setListWidth] = useState(DEFAULT_LIST);

  const mailViewKey = mailView.type === 'label' ? mailView.labelId : mailView.query;
  useEffect(() => {
    setRemovedThreadIds([]);
  }, [mailView.type, mailViewKey]);
  const resizeRef = useRef<{
    which: 'sidebar' | 'list';
    startX: number;
    startWidth: number;
    lastSidebarWidth: number;
    lastListWidth: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      storeGet<number>(PANEL_KEYS.sidebar),
      storeGet<number>(PANEL_KEYS.list),
    ]).then(([s, l]) => {
      if (typeof s === 'number' && s >= MIN_SIDEBAR && s <= MAX_SIDEBAR) setSidebarWidth(s);
      if (typeof l === 'number' && l >= MIN_LIST && l <= MAX_LIST) setListWidth(l);
    });
  }, []);

  const startResize = useCallback((which: 'sidebar' | 'list', startX: number, startWidth: number) => {
    const lastSidebar = which === 'sidebar' ? startWidth : sidebarWidth;
    const lastList = which === 'list' ? startWidth : listWidth;
    resizeRef.current = { which, startX, startWidth, lastSidebarWidth: lastSidebar, lastListWidth: lastList };
    const onMouseMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const clamped = Math.min(r.which === 'sidebar' ? MAX_SIDEBAR : MAX_LIST, Math.max(r.which === 'sidebar' ? MIN_SIDEBAR : MIN_LIST, r.startWidth + delta));
      if (r.which === 'sidebar') {
        r.lastSidebarWidth = clamped;
        setSidebarWidth(clamped);
      } else {
        r.lastListWidth = clamped;
        setListWidth(clamped);
      }
    };
    const onMouseUp = () => {
      const r = resizeRef.current;
      if (r) {
        storeSet(PANEL_KEYS.sidebar, r.lastSidebarWidth);
        storeSet(PANEL_KEYS.list, r.lastListWidth);
        resizeRef.current = null;
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth, listWidth]);

  const refreshAccounts = useCallback(() => {
    if (!window.electronAPI?.accounts?.list) return;
    window.electronAPI.accounts.list().then(setAccountsResult);
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    storeGet<BaseTheme>('theme').then((t) => {
      const base: BaseTheme = t === 'light' ? 'light' : 'dark';
      setTheme(base);
      applyTheme(base);
    });
  }, []);

  const toggleTheme = () => {
    const next: BaseTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storeSet('theme', next);
    applyTheme(next);
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

  const handleIndexAccount = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      await window.electronAPI?.indexing?.reindexAccount(activeAccountId);
    } catch { /* noop */ }
  }, [activeAccountId]);

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-bar__left">
          <span className="shell-bar__brand">SYNOD</span>
        </div>
        <div className="shell-bar__notch">
          <div className="shell-bar__notch-border" aria-hidden />
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
        </div>
        <div className="shell-bar__right">
          <button
            type="button"
            className="shell-bar__theme"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
          </button>
          <div className="shell-bar__controls">
            <button
              type="button"
              className="shell-bar__control"
              onClick={() => window.electronAPI?.windowControls?.minimize()}
              aria-label="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="shell-bar__control"
              onClick={() => window.electronAPI?.windowControls?.maximize()}
              aria-label="Maximize"
            >
              <Square size={14} />
            </button>
            <button
              type="button"
              className="shell-bar__control shell-bar__control--close"
              onClick={() => window.electronAPI?.windowControls?.close()}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'mail' ? (
        <div
          className="shell-mail"
          style={{ gridTemplateColumns: `${sidebarWidth}px 6px ${listWidth}px 6px 1fr` }}
        >
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
              onIndexAccount={handleIndexAccount}
              refreshAccounts={refreshAccounts}
            />
          </aside>
          <div
            className="shell-mail__resize-handle shell-mail__resize-handle--sidebar"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={(e) => {
              e.preventDefault();
              startResize('sidebar', e.clientX, sidebarWidth);
            }}
          />
          <section className="shell-mail__list">
            <MailSearch
              activeAccountId={activeAccountId}
              accountIds={accountsResult?.accountsOrder ?? accountsResult?.accounts?.map((a) => a.id) ?? []}
              onSelectThread={setSelectedThreadId}
            />
            <ThreadList
              activeAccountId={activeAccountId}
              mailView={mailView}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              removedThreadIds={removedThreadIds}
            />
          </section>
          <div
            className="shell-mail__resize-handle shell-mail__resize-handle--list"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize thread list"
            onMouseDown={(e) => {
              e.preventDefault();
              startResize('list', e.clientX, listWidth);
            }}
          />
          <main className="shell-mail__view">
            {selectedThreadId ? (
              <ThreadView
                threadId={selectedThreadId}
                activeAccountId={activeAccountId}
                currentUserEmail={activeAccountId}
                onDone={(threadId) => {
                  setRemovedThreadIds((prev) => [...prev, threadId]);
                  setSelectedThreadId(null);
                }}
                onDelete={(threadId) => {
                  setRemovedThreadIds((prev) => [...prev, threadId]);
                  setSelectedThreadId(null);
                }}
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
          <CalendarView accountsResult={accountsResult} />
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

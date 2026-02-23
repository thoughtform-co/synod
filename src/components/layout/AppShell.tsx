import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, CalendarDays, Sun, Moon, Minus, Square, X } from 'lucide-react';
import { type BaseTheme, applyTheme } from '@/app/App';
import { MailSidebar } from '@/features/mail/components/MailSidebar';
import { MailSearch } from '@/features/mail/components/MailSearch';
import { ThreadList } from '@/features/mail/components/ThreadList';
import { ThreadView } from '@/features/mail/components/ThreadView';
import { ComposeView } from '@/features/mail/components/ComposeView';
import { CalendarView } from '@/features/calendar/components/CalendarView';
import { storeGet, storeSet } from '@/lib/db/sqlite';
import type { AccountsListResult, LocalSearchResult } from '@/vite-env.d';
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
  const [searchResults, setSearchResults] = useState<LocalSearchResult[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [glitchThreadId, setGlitchThreadId] = useState<string | null>(null);

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
  const threadIdsRef = useRef<string[]>([]);
  const searchRef = useRef<import('@/features/mail/components/MailSearch').MailSearchHandle>(null);

  const accountsOrder = accountsResult?.accountsOrder ?? accountsResult?.accounts?.map((a) => a.id) ?? [];
  const isEditableFocus = () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el as HTMLElement).tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    if ((el as HTMLElement).getAttribute?.('contenteditable') === 'true') return true;
    return false;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && !isEditableFocus()) {
        e.preventDefault();
        setActiveTab((t) => (t === 'mail' ? 'calendar' : 'mail'));
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '9') {
        const i = e.key.charCodeAt(0) - 49;
        if (accountsOrder[i]) {
          e.preventDefault();
          window.electronAPI?.accounts?.setActive(accountsOrder[i]).then(refreshAccounts);
        }
        return;
      }
      if (mod && e.key === 'e') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('compose:send'));
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [accountsOrder, refreshAccounts]);

  const advancePastThread = useCallback((threadId: string) => {
    const ids = threadIdsRef.current;
    const idx = ids.indexOf(threadId);
    const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : idx > 0 ? ids[idx - 1] : null;
    setGlitchThreadId(threadId);
    setTimeout(() => {
      setRemovedThreadIds((prev) => [...prev, threadId]);
      setSelectedThreadId(nextId);
      setGlitchThreadId(null);
    }, 420);
  }, []);

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
              onCompose={() => setComposeOpen(true)}
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
              ref={searchRef}
              activeAccountId={activeAccountId}
              accountIds={accountsResult?.accountsOrder ?? accountsResult?.accounts?.map((a) => a.id) ?? []}
              onSelectThread={setSelectedThreadId}
              onLocalResults={setSearchResults}
            />
            <ThreadList
              activeAccountId={activeAccountId}
              currentUserEmail={accountsResult?.accounts?.find((a) => a.id === activeAccountId)?.email ?? null}
              mailView={mailView}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
              onViewChange={setMailView}
              removedThreadIds={removedThreadIds}
              glitchThreadId={glitchThreadId}
              searchResults={searchResults}
              threadIdsRef={threadIdsRef}
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
                currentUserEmail={accountsResult?.accounts?.find((a) => a.id === activeAccountId)?.email ?? null}
                isDoneView={mailView.type === 'query' && mailView.query === '-in:inbox -in:spam -in:trash'}
                onDone={advancePastThread}
                onDelete={advancePastThread}
              />
            ) : (
              <div className="shell-mail__empty">
                <p className="shell-mail__empty-text">Select a conversation</p>
                <button type="button" className="shell-mail__empty-compose" onClick={() => setComposeOpen(true)}>
                  New message
                </button>
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

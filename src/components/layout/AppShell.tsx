import { useState, useEffect } from 'react';
import { Mail, CalendarDays, Sun, Moon } from 'lucide-react';
import { MailSidebar } from '@/features/mail/components/MailSidebar';
import { ThreadList } from '@/features/mail/components/ThreadList';
import { ThreadView } from '@/features/mail/components/ThreadView';
import { CalendarView } from '@/features/calendar/components/CalendarView';
import { storeGet, storeSet } from '@/lib/db/sqlite';

type Tab = 'mail' | 'calendar';

export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('mail');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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
            <Mail size={17} strokeWidth={1.6} />
            <span className="shell-tab__label">Mail</span>
          </button>
          <button
            type="button"
            className={`shell-tab ${activeTab === 'calendar' ? 'shell-tab--active' : ''}`}
            onClick={() => setActiveTab('calendar')}
            aria-label="Calendar"
          >
            <CalendarDays size={17} strokeWidth={1.6} />
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
            <MailSidebar />
          </aside>
          <section className="shell-mail__list">
            <ThreadList
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
            />
          </section>
          <main className="shell-mail__view">
            {selectedThreadId ? (
              <ThreadView threadId={selectedThreadId} />
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
    </div>
  );
}

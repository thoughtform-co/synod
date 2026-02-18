import { useEffect, useState } from 'react';
import { storeGet, storeSet } from '@/lib/db/sqlite';

interface MailSidebarProps {
  onOpenCalendar: () => void;
  calendarOpen: boolean;
}

export function MailSidebar({ onOpenCalendar, calendarOpen }: MailSidebarProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    storeGet<'light' | 'dark'>('theme').then((t) => {
      if (t) setTheme(t);
    });
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storeSet('theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  return (
    <nav className="mail-sidebar">
      <div className="mail-sidebar__brand">Synod</div>
      <ul className="mail-sidebar__nav">
        <li><a href="#" className="mail-sidebar__link mail-sidebar__link--active">Inbox</a></li>
        <li><a href="#" className="mail-sidebar__link">Sent</a></li>
        <li><a href="#" className="mail-sidebar__link">Drafts</a></li>
        <li><a href="#" className="mail-sidebar__link">Archive</a></li>
      </ul>
      <button
        type="button"
        className="mail-sidebar__calendar"
        onClick={onOpenCalendar}
        aria-pressed={calendarOpen}
      >
        Calendar
      </button>
      <button
        type="button"
        className="mail-sidebar__theme"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>
    </nav>
  );
}

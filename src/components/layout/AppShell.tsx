import { useState } from 'react';
import { MailSidebar } from '@/features/mail/components/MailSidebar';
import { ThreadList } from '@/features/mail/components/ThreadList';
import { ThreadView } from '@/features/mail/components/ThreadView';
import { CalendarPanel } from '@/features/calendar/components/CalendarPanel';

export function AppShell() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <MailSidebar
          onOpenCalendar={() => setCalendarOpen((o) => !o)}
          calendarOpen={calendarOpen}
        />
      </aside>
      <section className="app-shell__thread-list">
        <ThreadList
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
        />
      </section>
      <main className="app-shell__main">
        {selectedThreadId ? (
          <ThreadView threadId={selectedThreadId} />
        ) : (
          <div className="app-shell__empty">
            <p className="app-shell__empty-text">Select a thread</p>
          </div>
        )}
      </main>
      {calendarOpen && (
        <aside className="app-shell__calendar">
          <CalendarPanel onClose={() => setCalendarOpen(false)} />
        </aside>
      )}
    </div>
  );
}

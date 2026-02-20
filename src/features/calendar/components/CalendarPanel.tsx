import { useEffect, useState } from 'react';
import { getActiveAccountId } from '@/features/auth/authStore';
import { fetchEvents, getReminderMinutes, setReminderMinutes, type CalendarEvent } from '../calendarClient';

interface CalendarPanelProps {
  onClose: () => void;
}

export function CalendarPanel({ onClose }: CalendarPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderMins, setReminderMins] = useState(15);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  useEffect(() => {
    getActiveAccountId().then(setActiveAccountId);
  }, []);

  useEffect(() => {
    if (activeAccountId === undefined) return;
    let cancelled = false;
    setLoading(true);
    fetchEvents(activeAccountId ?? undefined, 14)
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeAccountId]);

  useEffect(() => {
    getReminderMinutes().then(setReminderMins);
  }, []);

  const handleReminderChange = (mins: number) => {
    setReminderMins(mins);
    setReminderMinutes(mins);
  };

  const formatTime = (ev: CalendarEvent) => {
    if (ev.isAllDay) return 'All day';
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="calendar-panel">
      <header className="calendar-panel__header">
        <h2 className="calendar-panel__title">Calendar</h2>
        <button type="button" className="calendar-panel__close" onClick={onClose} aria-label="Close calendar">
          Close
        </button>
      </header>
      <div className="calendar-panel__reminder">
        <label className="calendar-panel__label">Remind me</label>
        <select
          className="calendar-panel__select"
          value={reminderMins}
          onChange={(e) => handleReminderChange(Number(e.target.value))}
        >
          <option value={5}>5 min before</option>
          <option value={10}>10 min before</option>
          <option value={15}>15 min before</option>
          <option value={30}>30 min before</option>
          <option value={60}>1 hour before</option>
        </select>
      </div>
      <div className="calendar-panel__content">
        {loading ? (
          <p className="calendar-panel__loading">Loading…</p>
        ) : events.length === 0 ? (
          <p className="calendar-panel__empty">No upcoming events</p>
        ) : (
          <ul className="calendar-panel__events">
            {events.map((ev) => (
              <li key={ev.id} className="calendar-panel__event">
                <span className="calendar-panel__event-date">{formatDate(ev.start)}</span>
                <span className="calendar-panel__event-time">{formatTime(ev)}</span>
                <span className="calendar-panel__event-summary">{ev.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

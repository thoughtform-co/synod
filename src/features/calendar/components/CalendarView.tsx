import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import {
  fetchEvents,
  getReminderMinutes,
  setReminderMinutes,
  type CalendarEvent,
} from '../calendarClient';

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderMins, setReminderMins] = useState(15);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEvents(14)
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const groupByDate = (list: CalendarEvent[]) => {
    const groups: Record<string, CalendarEvent[]> = {};
    for (const ev of list) {
      const key = new Date(ev.start).toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      (groups[key] ??= []).push(ev);
    }
    return Object.entries(groups);
  };

  return (
    <div className="cal-view">
      <header className="cal-view__header">
        <h1 className="cal-view__title">Upcoming</h1>
        <div className="cal-view__reminder">
          <Clock size={14} strokeWidth={1.5} />
          <select
            className="cal-view__select"
            value={reminderMins}
            onChange={(e) => handleReminderChange(Number(e.target.value))}
          >
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
          </select>
        </div>
      </header>

      <div className="cal-view__body">
        {loading ? (
          <p className="cal-view__loading">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="cal-view__empty">No upcoming events in the next two weeks.</p>
        ) : (
          <div className="cal-view__groups">
            {groupByDate(events).map(([date, dayEvents]) => (
              <section key={date} className="cal-day">
                <h2 className="cal-day__date">{date}</h2>
                <ul className="cal-day__events">
                  {dayEvents.map((ev) => (
                    <li key={ev.id} className="cal-event">
                      <span className="cal-event__time">{formatTime(ev)}</span>
                      <span className="cal-event__summary">{ev.summary}</span>
                      {ev.location && (
                        <span className="cal-event__location">{ev.location}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

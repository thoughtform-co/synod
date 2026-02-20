import { useEffect, useState } from 'react';
import { Clock, Mail } from 'lucide-react';
import { getActiveAccountId } from '@/features/auth/authStore';
import {
  fetchEvents,
  getReminderMinutes,
  setReminderMinutes,
  type CalendarEvent,
} from '../calendarClient';

const GMAIL_INBOX_BASE = 'https://mail.google.com/mail/u/0/#inbox/';

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderMins, setReminderMins] = useState(15);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [inviteThreads, setInviteThreads] = useState<{ id: string; snippet: string }[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId || activeAccountId === undefined) return;
    setInvitesLoading(true);
    window.electronAPI?.gmail
      ?.searchThreads(activeAccountId, 'has:invite', 20)
      .then(({ threads }) => {
        setInviteThreads(threads.map((t) => ({ id: t.id, snippet: t.snippet || '' })));
      })
      .catch(() => setInviteThreads([]))
      .finally(() => setInvitesLoading(false));
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

      <section className="cal-invites" aria-labelledby="cal-invites-title">
        <h2 id="cal-invites-title" className="cal-invites__title">
          <Mail size={14} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Invites
        </h2>
        {invitesLoading ? (
          <p className="cal-invites__empty">Loading invites…</p>
        ) : inviteThreads.length === 0 ? (
          <p className="cal-invites__empty">No pending invites.</p>
        ) : (
          <ul className="cal-invites__list">
            {inviteThreads.map((t) => (
              <li key={t.id} className="cal-invite-card">
                <p className="cal-invite-card__snippet">{t.snippet || '(No preview)'}</p>
                <div className="cal-invite-card__actions">
                  <a
                    href={`${GMAIL_INBOX_BASE}${t.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cal-invite-card__link"
                  >
                    Open in Gmail
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

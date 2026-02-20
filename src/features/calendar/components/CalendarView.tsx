import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  fetchEventsForAccounts,
  getReminderMinutes,
  setReminderMinutes,
  type CalendarEvent,
} from '../calendarClient';
import type { AccountEntry, AccountsListResult } from '@/vite-env.d';

export type CalViewMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
  accountsResult: AccountsListResult | null;
}

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getMonth() !== month && cursor.getDay() === 0) break;
  }
  return weeks;
}

function getWeekDays(anchor: Date): Date[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  return events.filter((ev) => {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    return s <= dayEnd && e >= dayStart;
  });
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatEventTime(ev: CalendarEvent): string {
  if (ev.isAllDay) return 'All day';
  const s = new Date(ev.start);
  return s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const ACCOUNT_COLORS = [
  'var(--gold)',
  '#6ba3be',
  '#be6b8a',
  '#7bbe6b',
  '#be9a6b',
  '#8a6bbe',
  '#6bbeb3',
  '#be6b6b',
];

function accountColor(accounts: AccountEntry[], accountId?: string): string {
  if (!accountId) return ACCOUNT_COLORS[0];
  const idx = accounts.findIndex((a) => a.id === accountId);
  return ACCOUNT_COLORS[idx >= 0 ? idx % ACCOUNT_COLORS.length : 0];
}

export function CalendarView({ accountsResult }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalViewMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [enabledAccounts, setEnabledAccounts] = useState<Set<string>>(new Set());
  const [reminderMins, setReminderMins] = useState(15);

  const accounts = accountsResult?.accounts ?? [];
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && enabledAccounts.size === 0) {
      setEnabledAccounts(new Set(accounts.map((a) => a.id)));
    }
  }, [accounts, enabledAccounts.size]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const s = startOfWeek(first);
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      const e = addDays(startOfWeek(addDays(last, 6)), 1);
      return { rangeStart: s, rangeEnd: e };
    }
    if (viewMode === 'week') {
      const s = startOfWeek(anchor);
      return { rangeStart: s, rangeEnd: addDays(s, 7) };
    }
    const s = new Date(anchor);
    s.setHours(0, 0, 0, 0);
    return { rangeStart: s, rangeEnd: addDays(s, 1) };
  }, [viewMode, anchor]);

  const loadEvents = useCallback(async () => {
    const ids = Array.from(enabledAccounts);
    if (ids.length === 0) {
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const evts = await fetchEventsForAccounts(ids, rangeStart.toISOString(), rangeEnd.toISOString());
      setEvents(evts);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [enabledAccounts, rangeStart, rangeEnd]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    getReminderMinutes().then(setReminderMins);
  }, []);

  const handleReminderChange = (mins: number) => {
    setReminderMins(mins);
    setReminderMinutes(mins);
  };

  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'week') d.setDate(d.getDate() + 7 * dir);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const toggleAccount = (id: string) => {
    setEnabledAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (viewMode === 'week') {
      const days = getWeekDays(anchor);
      const first = days[0];
      const last = days[6];
      if (first.getMonth() === last.getMonth()) {
        return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
      }
      return `${MONTH_NAMES[first.getMonth()].slice(0, 3)} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
    }
    return anchor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [viewMode, anchor]);

  const monthGrid = useMemo(() => {
    if (viewMode !== 'month') return [];
    return getMonthGrid(anchor.getFullYear(), anchor.getMonth());
  }, [viewMode, anchor]);

  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return [];
    return getWeekDays(anchor);
  }, [viewMode, anchor]);

  const filteredEvents = useMemo(
    () => events.filter((e) => !e.accountId || enabledAccounts.has(e.accountId)),
    [events, enabledAccounts],
  );

  return (
    <div className="synod-cal">
      {/* ── Left sidebar ── */}
      <aside className="synod-cal__sidebar">
        <MiniMonth
          year={anchor.getFullYear()}
          month={anchor.getMonth()}
          today={today}
          selected={anchor}
          onSelect={(d) => setAnchor(d)}
          onMonthChange={(dir) => {
            setAnchor((prev) => {
              const n = new Date(prev);
              n.setMonth(n.getMonth() + dir);
              return n;
            });
          }}
        />

        <div className="synod-cal__accounts">
          <h3 className="synod-cal__accounts-title">Accounts</h3>
          {accounts.length === 0 ? (
            <p className="synod-cal__accounts-empty">No accounts</p>
          ) : (
            <ul className="synod-cal__accounts-list">
              {accounts.map((acc) => (
                <li key={acc.id} className="synod-cal__account-item">
                  <label className="synod-cal__account-label">
                    <span
                      className="synod-cal__account-dot"
                      style={{
                        background: enabledAccounts.has(acc.id)
                          ? accountColor(accounts, acc.id)
                          : 'transparent',
                        borderColor: accountColor(accounts, acc.id),
                      }}
                    />
                    <input
                      type="checkbox"
                      className="synod-cal__account-check"
                      checked={enabledAccounts.has(acc.id)}
                      onChange={() => toggleAccount(acc.id)}
                    />
                    <span className="synod-cal__account-email">{acc.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="synod-cal__reminder">
          <Clock size={13} strokeWidth={1.5} />
          <select
            className="synod-cal__reminder-select"
            value={reminderMins}
            onChange={(e) => handleReminderChange(Number(e.target.value))}
          >
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hr</option>
          </select>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="synod-cal__main">
        {/* Toolbar */}
        <header className="synod-cal__toolbar">
          <div className="synod-cal__toolbar-left">
            <button className="synod-cal__today-btn" onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <button className="synod-cal__nav-btn" onClick={() => navigate(-1)} aria-label="Previous">
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button className="synod-cal__nav-btn" onClick={() => navigate(1)} aria-label="Next">
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            <h1 className="synod-cal__header-label">{headerLabel}</h1>
          </div>
          <div className="synod-cal__view-switcher">
            {(['month', 'week', 'day'] as const).map((m) => (
              <button
                key={m}
                className={`synod-cal__view-btn ${viewMode === m ? 'synod-cal__view-btn--active' : ''}`}
                onClick={() => setViewMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </header>

        {/* Grid */}
        <div className="synod-cal__grid-wrap">
          {loading && <div className="synod-cal__loading">Loading…</div>}

          {viewMode === 'month' && (
            <MonthGrid
              weeks={monthGrid}
              events={filteredEvents}
              today={today}
              currentMonth={anchor.getMonth()}
              accounts={accounts}
              onDayClick={(d) => {
                setAnchor(d);
                setViewMode('day');
              }}
            />
          )}

          {viewMode === 'week' && (
            <WeekGrid
              days={weekDays}
              events={filteredEvents}
              today={today}
              accounts={accounts}
            />
          )}

          {viewMode === 'day' && (
            <DayGrid
              day={anchor}
              events={filteredEvents}
              today={today}
              accounts={accounts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Mini month (sidebar) ── */

function MiniMonth({
  year,
  month,
  today,
  selected,
  onSelect,
  onMonthChange,
}: {
  year: number;
  month: number;
  today: Date;
  selected: Date;
  onSelect: (d: Date) => void;
  onMonthChange: (dir: -1 | 1) => void;
}) {
  const weeks = getMonthGrid(year, month);
  return (
    <div className="mini-month">
      <div className="mini-month__header">
        <button className="mini-month__nav" onClick={() => onMonthChange(-1)} aria-label="Previous month">
          <ChevronLeft size={13} strokeWidth={1.5} />
        </button>
        <span className="mini-month__label">{MONTH_NAMES[month].slice(0, 3)} {year}</span>
        <button className="mini-month__nav" onClick={() => onMonthChange(1)} aria-label="Next month">
          <ChevronRight size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div className="mini-month__grid">
        {DAY_NAMES_SHORT.map((d) => (
          <span key={d} className="mini-month__day-name">{d.charAt(0)}</span>
        ))}
        {weeks.flat().map((d, i) => {
          const isToday = isSameDay(d, today);
          const isSel = isSameDay(d, selected);
          const isOther = d.getMonth() !== month;
          return (
            <button
              key={i}
              className={[
                'mini-month__cell',
                isToday && 'mini-month__cell--today',
                isSel && 'mini-month__cell--selected',
                isOther && 'mini-month__cell--other',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Month grid ── */

function MonthGrid({
  weeks,
  events,
  today,
  currentMonth,
  accounts,
  onDayClick,
}: {
  weeks: Date[][];
  events: CalendarEvent[];
  today: Date;
  currentMonth: number;
  accounts: AccountEntry[];
  onDayClick: (d: Date) => void;
}) {
  return (
    <div className="month-grid">
      <div className="month-grid__header">
        {DAY_NAMES_SHORT.map((d) => (
          <span key={d} className="month-grid__day-name">{d}</span>
        ))}
      </div>
      <div className="month-grid__body">
        {weeks.map((week, wi) => (
          <div key={wi} className="month-grid__row">
            {week.map((day, di) => {
              const dayEvents = eventsForDay(events, day);
              const isToday = isSameDay(day, today);
              const isOther = day.getMonth() !== currentMonth;
              return (
                <div
                  key={di}
                  className={[
                    'month-grid__cell',
                    isToday && 'month-grid__cell--today',
                    isOther && 'month-grid__cell--other',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onDayClick(day)}
                >
                  <span className="month-grid__date">{day.getDate()}</span>
                  <div className="month-grid__events">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="month-grid__event"
                        style={{ '--ev-color': accountColor(accounts, ev.accountId) } as React.CSSProperties}
                        title={`${formatEventTime(ev)} ${ev.summary}`}
                      >
                        <span className="month-grid__event-dot" />
                        <span className="month-grid__event-text">{ev.summary}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="month-grid__more">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Week grid (time-based) ── */

function WeekGrid({
  days,
  events,
  today,
  accounts,
}: {
  days: Date[];
  events: CalendarEvent[];
  today: Date;
  accounts: AccountEntry[];
}) {
  return (
    <div className="week-grid">
      <div className="week-grid__header">
        <div className="week-grid__gutter" />
        {days.map((d, i) => (
          <div
            key={i}
            className={`week-grid__col-header ${isSameDay(d, today) ? 'week-grid__col-header--today' : ''}`}
          >
            <span className="week-grid__col-day">{DAY_NAMES_SHORT[d.getDay()]}</span>
            <span className="week-grid__col-date">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="week-grid__body">
        <div className="week-grid__time-col">
          {HOURS.map((h) => (
            <div key={h} className="week-grid__time-label">{formatHour(h)}</div>
          ))}
        </div>
        {days.map((day, di) => {
          const dayEvts = eventsForDay(events, day);
          return (
            <div key={di} className="week-grid__day-col">
              {HOURS.map((h) => (
                <div key={h} className="week-grid__hour-cell" />
              ))}
              {dayEvts.filter((e) => !e.isAllDay).map((ev) => {
                const s = new Date(ev.start);
                const e = new Date(ev.end);
                const topMin = s.getHours() * 60 + s.getMinutes();
                const durMin = Math.max((e.getTime() - s.getTime()) / 60000, 15);
                return (
                  <div
                    key={ev.id}
                    className="week-grid__event"
                    style={{
                      top: `${(topMin / 1440) * 100}%`,
                      height: `${(durMin / 1440) * 100}%`,
                      '--ev-color': accountColor(accounts, ev.accountId),
                    } as React.CSSProperties}
                    title={`${ev.summary}\n${formatEventTime(ev)}`}
                  >
                    <span className="week-grid__event-title">{ev.summary}</span>
                    <span className="week-grid__event-time">{formatEventTime(ev)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Day grid (single day, hourly) ── */

function DayGrid({
  day,
  events,
  accounts,
}: {
  day: Date;
  events: CalendarEvent[];
  today?: Date;
  accounts: AccountEntry[];
}) {
  const dayEvts = eventsForDay(events, day);
  const allDay = dayEvts.filter((e) => e.isAllDay);
  const timed = dayEvts.filter((e) => !e.isAllDay);

  return (
    <div className="day-grid">
      {allDay.length > 0 && (
        <div className="day-grid__allday">
          {allDay.map((ev) => (
            <div
              key={ev.id}
              className="day-grid__allday-event"
              style={{ '--ev-color': accountColor(accounts, ev.accountId) } as React.CSSProperties}
            >
              {ev.summary}
            </div>
          ))}
        </div>
      )}
      <div className="day-grid__body">
        <div className="day-grid__time-col">
          {HOURS.map((h) => (
            <div key={h} className="day-grid__time-label">{formatHour(h)}</div>
          ))}
        </div>
        <div className="day-grid__main-col">
          {HOURS.map((h) => (
            <div key={h} className="day-grid__hour-cell" />
          ))}
          {timed.map((ev) => {
            const s = new Date(ev.start);
            const e = new Date(ev.end);
            const topMin = s.getHours() * 60 + s.getMinutes();
            const durMin = Math.max((e.getTime() - s.getTime()) / 60000, 15);
            return (
              <div
                key={ev.id}
                className="day-grid__event"
                style={{
                  top: `${(topMin / 1440) * 100}%`,
                  height: `${(durMin / 1440) * 100}%`,
                  '--ev-color': accountColor(accounts, ev.accountId),
                } as React.CSSProperties}
              >
                <span className="day-grid__event-title">{ev.summary}</span>
                <span className="day-grid__event-time">{formatEventTime(ev)}</span>
                {ev.location && <span className="day-grid__event-loc">{ev.location}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { fetchDashboardData, type DashboardData } from '../dashboardService';
import { ParticleField } from './ParticleField';
import type { AccountsListResult } from '@/vite-env.d';
import type { CalendarEvent } from '@/features/calendar/calendarClient';

interface DashboardViewProps {
  accountsResult: AccountsListResult | null;
  activeAccountId: string | null;
}

function formatEventTime(ev: CalendarEvent): string {
  if (ev.isAllDay) return 'All day';
  const s = new Date(ev.start);
  return s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isToday(d: Date, ev: CalendarEvent): boolean {
  const start = new Date(ev.start);
  return d.getFullYear() === start.getFullYear() && d.getMonth() === start.getMonth() && d.getDate() === start.getDate();
}

export function DashboardView({ accountsResult, activeAccountId }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const accountIds = accountsResult?.accounts?.map((a) => a.id) ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    setLoading(true);
    fetchDashboardData(accountIds, activeAccountId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [accountIds.join(','), activeAccountId]);

  const todayEvents = data?.upcomingEvents.filter((e) => isToday(today, e)) ?? [];
  const upcomingEvents = data?.upcomingEvents.filter((e) => !isToday(today, e)).slice(0, 10) ?? [];

  return (
    <div className="hub">
      <div className="hub__grid">
        <aside className="hub__panel hub__panel--left">
          <div className="hub__section-header">01 UNREPLIED</div>
          {loading ? (
            <div className="hub__placeholder">Loading…</div>
          ) : (
            <ul className="hub__list">
              {(data?.insightItems ?? []).map((item, i) => (
                <li key={`${item.threadId ?? i}-${i}`} className="hub__card">
                  <div className="hub__card-title">{item.title}</div>
                  {item.subtitle && <div className="hub__card-subtitle">{item.subtitle}</div>}
                  {item.suggestedAction && (
                    <div className="hub__card-action">{item.suggestedAction}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!loading && (!data?.insightItems?.length) && (
            <div className="hub__placeholder">No pending actions</div>
          )}
        </aside>
        <div className="hub__center" aria-hidden>
          <ParticleField
            className="hub__viz"
            intensity={
              data
                ? Math.min(
                    1,
                    (data.insightItems.length + data.pendingInviteCount + todayEvents.length) / 20
                  )
                : 0.3
            }
          />
        </div>
        <aside className="hub__panel hub__panel--right">
          <div className="hub__section-header">TODAY</div>
          {loading ? (
            <div className="hub__placeholder">Loading…</div>
          ) : (
            <ul className="hub__list">
              {todayEvents.slice(0, 8).map((ev) => (
                <li
                  key={ev.id}
                  className={`hub__event hub__event--today ${ev.eventType === 'physical' ? 'hub__event--physical' : ''} ${ev.eventType === 'virtual' ? 'hub__event--virtual' : ''}`}
                >
                  <span className="hub__event-time">{formatEventTime(ev)}</span>
                  <span className="hub__event-title">{ev.summary}</span>
                </li>
              ))}
            </ul>
          )}
          {!loading && todayEvents.length === 0 && (
            <div className="hub__placeholder">No events today</div>
          )}
          <div className="hub__section-header">UPCOMING</div>
          <ul className="hub__list">
            {upcomingEvents.map((ev) => (
              <li
                key={ev.id}
                className={`hub__event ${ev.eventType === 'physical' ? 'hub__event--physical' : ''} ${ev.eventType === 'virtual' ? 'hub__event--virtual' : ''}`}
              >
                <span className="hub__event-time">{formatEventTime(ev)}</span>
                <span className="hub__event-title">{ev.summary}</span>
              </li>
            ))}
          </ul>
          {data?.pendingInviteCount ? (
            <>
              <div className="hub__section-header">PENDING INVITES</div>
              <div className="hub__placeholder">{data.pendingInviteCount} invite(s) — open Calendar sidebar</div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

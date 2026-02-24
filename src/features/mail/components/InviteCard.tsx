import { useCallback, useEffect, useState } from 'react';
import type { ParsedIcsEvent, AnalyzeEmailResult, CalendarEvent } from '@/vite-env.d';

const INVITE_CARD = 'invite-card';

interface InviteCardProps {
  threadId: string;
  activeAccountId: string | null;
  subject: string;
  /** From ICS parse (Path A). */
  parsedIcs: ParsedIcsEvent | null;
  /** From Claude analyzeEmail (Path B). */
  aiDetected: AnalyzeEmailResult | null;
  /** Callback to open event editor with pre-filled data (for Add to Calendar). */
  onAddToCalendar: (prefill: {
    summary?: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    isAllDay: boolean;
    location?: string;
    description?: string;
  }) => void;
  /** After RSVP, optional refresh. */
  onRsvpDone?: () => void;
}

function formatIcsDateForDisplay(dtStart?: string, dtEnd?: string): string {
  if (!dtStart) return '';
  const isDateOnly = dtStart.length === 10;
  if (isDateOnly) {
    const d = new Date(dtStart + 'T12:00:00');
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    return dtEnd && dtEnd !== dtStart ? `${dateStr} (all day)` : dateStr;
  }
  const start = new Date(dtStart);
  const end = dtEnd ? new Date(dtEnd) : null;
  const timeStr = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const endStr = end ? end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
  const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return endStr ? `${dateStr} ${timeStr} – ${endStr}` : `${dateStr} ${timeStr}`;
}

function buildPrefillFromIcs(parsed: ParsedIcsEvent): {
  summary: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
} {
  const dtStart = parsed.dtStart ?? '';
  const dtEnd = parsed.dtEnd ?? dtStart;
  const isAllDay = dtStart.length === 10;
  let startDate = dtStart.slice(0, 10);
  let startTime = '09:00';
  let endDate = dtEnd.slice(0, 10);
  let endTime = '10:00';
  if (!isAllDay && dtStart.length >= 16) {
    startTime = dtStart.slice(11, 16);
    if (dtEnd.length >= 16) endTime = dtEnd.slice(11, 16);
    else endTime = startTime;
  }
  return {
    summary: parsed.summary ?? 'Event',
    startDate,
    startTime,
    endDate,
    endTime,
    isAllDay,
    location: parsed.location,
    description: parsed.description,
  };
}

function buildPrefillFromAi(ai: AnalyzeEmailResult): {
  summary: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
} {
  const ed = ai.eventDetails;
  const title = ed?.title ?? 'Event';
  const date = ed?.date ?? new Date().toISOString().slice(0, 10);
  const time = ed?.time ?? '09:00';
  const [startTime, endTime] = time.includes('-') ? time.split('-').map((t) => t.trim()) : [time, time];
  return {
    summary: title,
    startDate: date,
    startTime: startTime.length === 5 ? startTime : '09:00',
    endDate: date,
    endTime: endTime.length === 5 ? endTime : '10:00',
    isAllDay: false,
    location: ed?.location,
    description: ed?.description,
  };
}

export function InviteCard({
  activeAccountId,
  subject,
  parsedIcs,
  aiDetected,
  onAddToCalendar,
  onRsvpDone,
}: InviteCardProps) {
  const [matchedEvent, setMatchedEvent] = useState<CalendarEvent | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState<'accepted' | 'tentative' | 'declined' | null>(null);
  const [resolving, setResolving] = useState(true);

  const canRsvp = !!parsedIcs && !!matchedEvent && !!activeAccountId;
  const title = parsedIcs?.summary ?? aiDetected?.eventDetails?.title ?? subject;
  const location = parsedIcs?.location ?? aiDetected?.eventDetails?.location;
  const dateTimeDisplay = parsedIcs
    ? formatIcsDateForDisplay(parsedIcs.dtStart, parsedIcs.dtEnd)
    : aiDetected?.eventDetails?.date && aiDetected?.eventDetails?.time
      ? `${aiDetected.eventDetails.date} ${aiDetected.eventDetails.time}`
      : '';

  useEffect(() => {
    if (!parsedIcs?.dtStart || !activeAccountId) {
      setResolving(false);
      return;
    }
    const api = window.electronAPI?.calendar;
    if (!api?.listEventsRange) {
      setResolving(false);
      return;
    }
    const start = parsedIcs.dtStart!;
    const isDateOnly = start.length === 10;
    const timeMin = isDateOnly ? `${start}T00:00:00` : start.slice(0, 19).replace(/-/g, '-');
    const timeMax = isDateOnly ? `${start}T23:59:59` : (parsedIcs.dtEnd ?? start).slice(0, 19).replace(/-/g, '-');
    api
      .listEventsRange(activeAccountId, timeMin, timeMax)
      .then((events: CalendarEvent[]) => {
        const summary = (parsedIcs.summary ?? '').trim().toLowerCase();
        const match = events.find(
          (e) => e.summary && e.summary.trim().toLowerCase() === summary
        );
        setMatchedEvent(match ?? null);
      })
      .catch(() => setMatchedEvent(null))
      .finally(() => setResolving(false));
  }, [parsedIcs?.dtStart, parsedIcs?.dtEnd, parsedIcs?.summary, activeAccountId]);

  const handleRsvp = useCallback(
    (response: 'accepted' | 'tentative' | 'declined') => {
      if (!matchedEvent || !window.electronAPI?.calendar?.respondToEvent) return;
      setRsvpLoading(response);
      window.electronAPI.calendar
        .respondToEvent(activeAccountId ?? undefined, matchedEvent.id, response, matchedEvent.calendarId)
        .then(() => onRsvpDone?.())
        .finally(() => setRsvpLoading(null));
    },
    [matchedEvent, activeAccountId, onRsvpDone]
  );

  const handleAddToCalendar = useCallback(() => {
    if (parsedIcs) onAddToCalendar(buildPrefillFromIcs(parsedIcs));
    else if (aiDetected?.eventDetails) onAddToCalendar(buildPrefillFromAi(aiDetected));
  }, [parsedIcs, aiDetected, onAddToCalendar]);

  if (!parsedIcs && !aiDetected) return null;
  if (parsedIcs?.method === 'CANCEL') return null;

  return (
    <div className={INVITE_CARD}>
      <div className={`${INVITE_CARD}__frame`}>
        <div className={`${INVITE_CARD}__title`}>{title}</div>
        {dateTimeDisplay && (
          <div className={`${INVITE_CARD}__datetime`}>{dateTimeDisplay}</div>
        )}
        {location && (
          <div className={`${INVITE_CARD}__location`}>{location}</div>
        )}
        <div className={`${INVITE_CARD}__actions`}>
          {canRsvp && !resolving ? (
            <>
              <button
                type="button"
                className={`${INVITE_CARD}__btn ${INVITE_CARD}__btn--accept`}
                onClick={() => handleRsvp('accepted')}
                disabled={!!rsvpLoading}
              >
                {rsvpLoading === 'accepted' ? '…' : 'Accept'}
              </button>
              <button
                type="button"
                className={`${INVITE_CARD}__btn ${INVITE_CARD}__btn--maybe`}
                onClick={() => handleRsvp('tentative')}
                disabled={!!rsvpLoading}
              >
                {rsvpLoading === 'tentative' ? '…' : 'Maybe'}
              </button>
              <button
                type="button"
                className={`${INVITE_CARD}__btn ${INVITE_CARD}__btn--decline`}
                onClick={() => handleRsvp('declined')}
                disabled={!!rsvpLoading}
              >
                {rsvpLoading === 'declined' ? '…' : 'Decline'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${INVITE_CARD}__btn ${INVITE_CARD}__btn--add`}
              onClick={handleAddToCalendar}
              disabled={resolving}
            >
              {resolving ? 'Checking calendar…' : 'Add to Calendar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

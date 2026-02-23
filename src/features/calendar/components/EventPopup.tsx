import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import type { CalendarEvent } from '../calendarClient';
import type { AccountEntry } from '@/vite-env.d';

function formatPopupDate(ev: CalendarEvent): string {
  const d = new Date(ev.start);
  return d.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function formatPopupTime(ev: CalendarEvent): string {
  if (ev.isAllDay) return 'All day';
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  return `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function accountColor(accounts: AccountEntry[], accountId?: string): string {
  const colors = ['var(--gold)', '#6ba3be', '#be6b8a', '#7bbe6b', '#be9a6b', '#8a6bbe', '#6bbeb3', '#be6b6b'];
  const idx = accounts.findIndex((a) => a.id === accountId);
  return colors[idx >= 0 ? idx % colors.length : 0];
}

interface EventPopupProps {
  event: CalendarEvent;
  position: { x: number; y: number } | null;
  accounts: AccountEntry[];
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}

export function EventPopup({ event, position, accounts, onClose, onEdit }: EventPopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rsvpLoading, setRsvpLoading] = useState<'accepted' | 'tentative' | 'declined' | null>(null);

  const handleRsvp = useCallback(
    (response: 'accepted' | 'tentative' | 'declined') => {
      const api = window.electronAPI?.calendar;
      if (!api?.respondToEvent) return;
      setRsvpLoading(response);
      const respond = (api as { respondToEvent: (a?: string, e?: string, r: string, c?: string) => Promise<void> })
        .respondToEvent;
      respond(event.accountId ?? undefined, event.id, response, event.calendarId)
        .then(onClose)
        .finally(() => setRsvpLoading(null));
    },
    [event.accountId, event.id, event.calendarId, onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const account = accounts.find((a) => a.id === event.accountId);
  const color = accountColor(accounts, event.accountId);

  return (
    <>
      <div
        className="synod-cal__event-popup-backdrop"
        onClick={onClose}
        role="presentation"
        aria-hidden
      />
      <div
        ref={cardRef}
        className="synod-cal__event-popup"
        style={
          position
            ? { left: Math.min(position.x, window.innerWidth - 320), top: Math.min(position.y + 8, window.innerHeight - 360) }
            : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
        }
        role="dialog"
        aria-label="Event details"
      >
        <button
          type="button"
          className="synod-cal__event-popup-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
        <h2 className="synod-cal__event-popup-title">{event.summary || '(No title)'}</h2>
        <p className="synod-cal__event-popup-datetime">
          {formatPopupDate(event)} · {formatPopupTime(event)}
        </p>
        {event.location && (
          <p className="synod-cal__event-popup-location">
            <MapPin size={12} strokeWidth={1.5} className="synod-cal__event-popup-loc-icon" />
            {event.location}
          </p>
        )}
        {event.description && (
          <div className="synod-cal__event-popup-description">{event.description}</div>
        )}
        <div className="synod-cal__event-popup-meta">
          <span
            className="synod-cal__event-popup-dot"
            style={{ background: color, borderColor: color }}
          />
          <span className="synod-cal__event-popup-calendar">{account?.email ?? 'Calendar'}</span>
        </div>
        <div className="synod-cal__event-popup-actions">
          <div className="synod-cal__event-popup-rsvp">
            <button
              type="button"
              className="synod-cal__event-popup-rsvp-btn synod-cal__event-popup-rsvp-btn--yes"
              onClick={() => handleRsvp('accepted')}
              disabled={rsvpLoading !== null}
            >
              Yes
            </button>
            <button
              type="button"
              className="synod-cal__event-popup-rsvp-btn synod-cal__event-popup-rsvp-btn--maybe"
              onClick={() => handleRsvp('tentative')}
              disabled={rsvpLoading !== null}
            >
              Maybe
            </button>
            <button
              type="button"
              className="synod-cal__event-popup-rsvp-btn synod-cal__event-popup-rsvp-btn--no"
              onClick={() => handleRsvp('declined')}
              disabled={rsvpLoading !== null}
            >
              No
            </button>
          </div>
          <button
            type="button"
            className="synod-cal__event-popup-edit"
            onClick={() => onEdit(event)}
          >
            Edit
          </button>
        </div>
      </div>
    </>
  );
}

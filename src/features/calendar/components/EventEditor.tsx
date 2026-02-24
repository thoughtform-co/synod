import { useCallback, useEffect, useState } from 'react';
import { X, ImagePlus } from 'lucide-react';
import type { CalendarEvent } from '../calendarClient';
import { createEvent, updateEvent, deleteEvent, type CalendarEventInput } from '../calendarClient';
import type { ExtractedEventFromImage } from '@/vite-env.d';

const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'RRULE:FREQ=DAILY', label: 'Daily' },
  { value: 'RRULE:FREQ=WEEKLY', label: 'Weekly' },
  { value: 'RRULE:FREQ=MONTHLY', label: 'Monthly' },
  { value: 'RRULE:FREQ=YEARLY', label: 'Yearly' },
];

function toDateInput(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function toTimeInput(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export interface EventEditorPrefill {
  summary?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

interface EventEditorProps {
  mode: 'create' | 'edit';
  initialDate?: Date;
  initialEvent?: CalendarEvent;
  /** Pre-fill fields when mode is 'create' (e.g. from invite card or screenshot). */
  initialPrefill?: EventEditorPrefill;
  accountId: string | undefined;
  calendarId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

export function EventEditor({
  mode,
  initialDate,
  initialEvent,
  initialPrefill,
  accountId,
  calendarId,
  onClose,
  onSaved,
  onDeleted,
}: EventEditorProps) {
  const [summary, setSummary] = useState(() =>
    initialPrefill?.summary ?? initialEvent?.summary ?? ''
  );
  const [startDate, setStartDate] = useState(() => {
    if (initialPrefill) return initialPrefill.startDate;
    const d = initialEvent ? new Date(initialEvent.start) : (initialDate ?? new Date());
    return toDateInput(d);
  });
  const [startTime, setStartTime] = useState(() => {
    if (initialPrefill) return initialPrefill.startTime;
    const d = initialEvent ? new Date(initialEvent.start) : (initialDate ?? new Date());
    return initialEvent?.isAllDay ? '09:00' : toTimeInput(d);
  });
  const [endDate, setEndDate] = useState(() => {
    if (initialPrefill) return initialPrefill.endDate;
    const d = initialEvent ? new Date(initialEvent.end) : (initialDate ?? new Date());
    return toDateInput(d);
  });
  const [endTime, setEndTime] = useState(() => {
    if (initialPrefill) return initialPrefill.endTime;
    const d = initialEvent ? new Date(initialEvent.end) : (initialDate ?? new Date());
    return initialEvent?.isAllDay ? '10:00' : toTimeInput(d);
  });
  const [isAllDay, setIsAllDay] = useState(initialPrefill?.isAllDay ?? initialEvent?.isAllDay ?? false);
  const [location, setLocation] = useState(initialPrefill?.location ?? initialEvent?.location ?? '');
  const [description, setDescription] = useState(initialPrefill?.description ?? initialEvent?.description ?? '');
  const [attendees, setAttendees] = useState<string[]>(initialEvent ? [] : []); // API doesn't return attendees in list; we could skip for edit
  const [attendeeInput, setAttendeeInput] = useState('');
  const [recurrence, setRecurrence] = useState(initialEvent ? '' : '');
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteZoneCollapsed, setPasteZoneCollapsed] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pastePreview, setPastePreview] = useState<string | null>(null);

  const applyExtracted = useCallback((data: ExtractedEventFromImage) => {
    if (data.title) setSummary(data.title);
    if (data.date) setStartDate(data.date);
    if (data.startTime) setStartTime(data.startTime);
    if (data.endTime) setEndTime(data.endTime);
    if (data.date) setEndDate(data.date);
    if (data.location) setLocation(data.location);
    if (data.description) setDescription(data.description);
    setPasteZoneCollapsed(true);
    setPastePreview(null);
  }, []);

  const processImage = useCallback(
    async (file: File) => {
      const api = window.electronAPI?.claude;
      if (!api?.extractEventFromImage) return;
      const mediaType = file.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        if (!base64) return;
        setPastePreview(dataUrl);
        setExtracting(true);
        api
          .extractEventFromImage(base64, mediaType)
          .then((result: ExtractedEventFromImage) => {
            applyExtracted(result);
          })
          .catch(() => {
            setPastePreview(null);
          })
          .finally(() => setExtracting(false));
      };
      reader.readAsDataURL(file);
    },
    [applyExtracted]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (extracting || !window.electronAPI?.claude?.extractEventFromImage) return;
      const item = Array.from(e.clipboardData.items).find((x) => x.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        processImage(file);
      }
    },
    [extracting, processImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (extracting) return;
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) processImage(file);
    },
    [extracting, processImage]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const buildPayload = useCallback((): CalendarEventInput => {
    if (isAllDay) {
      return {
        summary: summary.trim() || undefined,
        start: startDate,
        end: endDate,
        isAllDay: true,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        attendees: attendees.length ? attendees : undefined,
        recurrence: recurrence ? [recurrence] : undefined,
        reminderMinutes: reminderMinutes,
      };
    }
    const start = `${startDate}T${startTime}:00`;
    const end = `${endDate}T${endTime}:00`;
    return {
      summary: summary.trim() || undefined,
      start,
      end,
      isAllDay: false,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      attendees: attendees.length ? attendees : undefined,
      recurrence: recurrence ? [recurrence] : undefined,
      reminderMinutes: reminderMinutes,
    };
  }, [summary, startDate, startTime, endDate, endTime, isAllDay, location, description, attendees, recurrence, reminderMinutes]);

  const handleSave = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      if (mode === 'edit' && initialEvent) {
        await updateEvent(accountId, calendarId, initialEvent.id, payload);
      } else {
        await createEvent(accountId, calendarId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [mode, initialEvent, accountId, calendarId, buildPayload, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (mode !== 'edit' || !initialEvent) return;
    if (!window.confirm('Delete this event?')) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteEvent(accountId, calendarId, initialEvent.id);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }, [mode, initialEvent, accountId, calendarId, onDeleted, onClose]);

  const addAttendee = () => {
    const email = attendeeInput.trim();
    if (email && !attendees.includes(email)) {
      setAttendees((prev) => [...prev, email]);
      setAttendeeInput('');
    }
  };

  const removeAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((e) => e !== email));
  };

  return (
    <div className="synod-cal__editor-backdrop" onClick={onClose} role="presentation" aria-hidden>
      <div
        className="synod-cal__editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={mode === 'edit' ? 'Edit event' : 'New event'}
      >
        <div className="synod-cal__editor-header">
          <h2 className="synod-cal__editor-title">{mode === 'edit' ? 'Edit event' : 'New event'}</h2>
          <button type="button" className="synod-cal__editor-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="synod-cal__editor-body" onPaste={handlePaste}>
          {mode === 'create' && (
            <div
              className={`synod-cal__editor-paste-zone ${pasteZoneCollapsed ? 'synod-cal__editor-paste-zone--collapsed' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {pasteZoneCollapsed ? (
                <button
                  type="button"
                  className="synod-cal__editor-paste-toggle"
                  onClick={() => setPasteZoneCollapsed(false)}
                >
                  <ImagePlus size={14} /> Paste another screenshot
                </button>
              ) : (
                <>
                  <div className="synod-cal__editor-paste-hint">
                    <ImagePlus size={18} />
                    <span>Paste screenshot to auto-fill</span>
                  </div>
                  {pastePreview && (
                    <div className="synod-cal__editor-paste-preview">
                      <img src={pastePreview} alt="Pasted" />
                      {extracting && <span className="synod-cal__editor-paste-loading">Extracting…</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <label className="synod-cal__editor-label">
            Title
            <input
              type="text"
              className="synod-cal__editor-input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Event title"
            />
          </label>

          <label className="synod-cal__editor-label synod-cal__editor-label--row">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
            />
            <span>All day</span>
          </label>

          <div className="synod-cal__editor-row">
            <label className="synod-cal__editor-label">
              Start
              <div className="synod-cal__editor-date-time">
                <input
                  type="date"
                  className="synod-cal__editor-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {!isAllDay && (
                  <input
                    type="time"
                    className="synod-cal__editor-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                )}
              </div>
            </label>
            <label className="synod-cal__editor-label">
              End
              <div className="synod-cal__editor-date-time">
                <input
                  type="date"
                  className="synod-cal__editor-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {!isAllDay && (
                  <input
                    type="time"
                    className="synod-cal__editor-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                )}
              </div>
            </label>
          </div>

          <label className="synod-cal__editor-label">
            Location
            <input
              type="text"
              className="synod-cal__editor-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
            />
          </label>

          <label className="synod-cal__editor-label">
            Description
            <textarea
              className="synod-cal__editor-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
            />
          </label>

          <label className="synod-cal__editor-label">
            Attendees
            <div className="synod-cal__editor-attendees">
              <input
                type="email"
                className="synod-cal__editor-input"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                placeholder="Email address"
              />
              <button type="button" className="synod-cal__editor-chip-btn" onClick={addAttendee}>
                Add
              </button>
            </div>
            {attendees.length > 0 && (
              <div className="synod-cal__editor-chips">
                {attendees.map((email) => (
                  <span key={email} className="synod-cal__editor-chip">
                    {email}
                    <button type="button" className="synod-cal__editor-chip-remove" onClick={() => removeAttendee(email)} aria-label={`Remove ${email}`}>
                      <X size={10} strokeWidth={2} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className="synod-cal__editor-label">
            Repeats
            <select
              className="synod-cal__editor-select"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value || 'none'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="synod-cal__editor-label">
            Reminder (minutes before)
            <input
              type="number"
              className="synod-cal__editor-input"
              min={0}
              max={40320}
              value={reminderMinutes ?? ''}
              onChange={(e) => setReminderMinutes(e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="Default"
            />
          </label>

          {error && <p className="synod-cal__editor-error">{error}</p>}

          <div className="synod-cal__editor-actions">
            {mode === 'edit' && (
              <button
                type="button"
                className="synod-cal__editor-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <div className="synod-cal__editor-actions-right">
              <button type="button" className="synod-cal__editor-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="synod-cal__editor-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

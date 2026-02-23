import { google } from 'googleapis';
import { getDb } from './db';
import { getSecret } from './secretStorage';
import { safeParse } from './safeJson';
import { withRetry } from './lib/apiClient';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? safeParse(row.value, null) : null;
}

function getActiveAccountId(db: import('better-sqlite3').Database): string | null {
  const active = getStoredJson(db, 'active_account') as string | null;
  if (active && typeof active === 'string') return active;
  const legacy = getStoredJson(db, 'account') as { email?: string } | null;
  return legacy?.email && typeof legacy.email === 'string' ? legacy.email : null;
}

function getCalendarClient(accountId?: string) {
  const db = getDb();
  if (!db) throw new Error('Database not initialized');

  const email = accountId && typeof accountId === 'string' ? accountId : getActiveAccountId(db);
  if (!email) throw new Error('No account connected');

  const clientId = getStoredJson(db, 'google_client_id') as string | null;
  const clientSecret = getSecret('google_client_secret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not stored');

  const row = db.prepare('SELECT tokens FROM accounts WHERE id = ?').get(email) as { tokens: string } | undefined;
  if (!row) throw new Error('No tokens for account');
  const tokens = safeParse(row.tokens, {} as { refresh_token?: string; access_token?: string; expiry_date?: number });
  if (!tokens.refresh_token) throw new Error('No tokens for account');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/oauth2callback');
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  selected: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
  calendarId?: string;
}

const DEFAULT_DAYS_AHEAD = 14;

/** List calendars the user has access to (selected in Calendar UI). */
export function listCalendars(accountId?: string): Promise<CalendarListEntry[]> {
  return withRetry(() => {
    const calendar = getCalendarClient(accountId);
    return calendar.calendarList
      .list()
      .then((res) => {
        const entries: CalendarListEntry[] = [];
        for (const cal of res.data.items || []) {
          if (!cal.id) continue;
          const selected = cal.selected !== false;
          entries.push({
            id: cal.id,
            summary: cal.summary ?? cal.id,
            backgroundColor: cal.backgroundColor ?? undefined,
            selected,
          });
        }
        return entries;
      });
  });
}

function parseEventsFromResponse(
  items: import('googleapis').calendar_v3.Schema$Event[],
  calendarId: string
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const event of items) {
    if (!event.id) continue;
    const isAllDay = !event.start?.dateTime;
    const startStr = event.start?.dateTime || event.start?.date;
    const endStr = event.end?.dateTime || event.end?.date;
    if (!startStr || !endStr) continue;
    events.push({
      id: event.id,
      summary: event.summary ?? '(No title)',
      start: startStr,
      end: endStr,
      isAllDay,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      calendarId,
    });
  }
  return events;
}

export function listEvents(accountId?: string, daysAhead: number = DEFAULT_DAYS_AHEAD): Promise<CalendarEvent[]> {
  return withRetry(async () => {
    try {
      const calendar = getCalendarClient(accountId);
      const calendars = await listCalendars(accountId);
      const visibleCalendars = calendars.filter((c) => c.selected);
      if (visibleCalendars.length === 0) visibleCalendars.push({ id: 'primary', summary: 'Primary', selected: true });

      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + daysAhead);
      const timeMin = now.toISOString();
      const timeMax = endDate.toISOString();

      const allEvents: CalendarEvent[] = [];
      for (const cal of visibleCalendars) {
        const res = await calendar.events.list({
          calendarId: cal.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        });
        allEvents.push(...parseEventsFromResponse(res.data.items || [], cal.id));
      }
      return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number })?.code;
      console.error('[calendar] listEvents failed:', message, code != null ? `(code ${code})` : '');
      if (code === 403 || message.toLowerCase().includes('calendar')) {
        console.error('[calendar] Ensure Google Calendar API is enabled for your project in Google Cloud Console.');
      }
      throw err;
    }
  });
}

export function listEventsRange(
  accountId: string | undefined,
  timeMin: string,
  timeMax: string,
  calendarId?: string
): Promise<CalendarEvent[]> {
  return withRetry(async () => {
    try {
      const calendar = getCalendarClient(accountId);
      const calendars = await listCalendars(accountId);
      const visibleCalendars = calendars.filter((c) => c.selected);
      if (visibleCalendars.length === 0) visibleCalendars.push({ id: 'primary', summary: 'Primary', selected: true });

      const idsToFetch = calendarId ? [calendarId] : visibleCalendars.map((c) => c.id);
      const allEvents: CalendarEvent[] = [];
      for (const cid of idsToFetch) {
        const res = await calendar.events.list({
          calendarId: cid,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
        });
        allEvents.push(...parseEventsFromResponse(res.data.items || [], cid));
      }
      return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: number })?.code;
      console.error('[calendar] listEventsRange failed:', message, code != null ? `(code ${code})` : '');
      if (code === 403 || message.toLowerCase().includes('calendar')) {
        console.error('[calendar] Ensure Google Calendar API is enabled for your project in Google Cloud Console.');
      }
      throw err;
    }
  });
}

export type RsvpResponse = 'accepted' | 'tentative' | 'declined';

export function respondToEvent(
  accountId: string | undefined,
  eventId: string,
  response: RsvpResponse,
  calendarId?: string
): Promise<void> {
  return withRetry(() => {
    const calendar = getCalendarClient(accountId);
    return calendar.events
      .patch({
        calendarId: calendarId ?? 'primary',
        eventId,
        requestBody: { responseStatus: response } as import('googleapis').calendar_v3.Schema$Event,
      })
      .then(() => undefined);
  });
}

import { google } from 'googleapis';
import { getDb } from './db';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
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
  const clientSecret = getStoredJson(db, 'google_client_secret') as string | null;
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not stored');

  const row = db.prepare('SELECT tokens FROM accounts WHERE id = ?').get(email) as { tokens: string } | undefined;
  if (!row) throw new Error('No tokens for account');
  const tokens = JSON.parse(row.tokens) as { refresh_token?: string; access_token?: string; expiry_date?: number };

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/oauth2callback');
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

const DEFAULT_DAYS_AHEAD = 14;

export function listEvents(accountId?: string, daysAhead: number = DEFAULT_DAYS_AHEAD): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient(accountId);
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + daysAhead);

  return calendar.events
    .list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
    .then((res) => {
      const events: CalendarEvent[] = [];
      for (const event of res.data.items || []) {
        if (!event.id || !event.summary) continue;
        const isAllDay = !event.start?.dateTime;
        const startStr = event.start?.dateTime || event.start?.date;
        const endStr = event.end?.dateTime || event.end?.date;
        if (!startStr || !endStr) continue;
        events.push({
          id: event.id,
          summary: event.summary,
          start: startStr,
          end: endStr,
          isAllDay,
          location: event.location ?? undefined,
          description: event.description ?? undefined,
        });
      }
      return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });
}

export function listEventsRange(
  accountId: string | undefined,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient(accountId);
  return calendar.events
    .list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    .then((res) => {
      const events: CalendarEvent[] = [];
      for (const event of res.data.items || []) {
        if (!event.id || !event.summary) continue;
        const isAllDay = !event.start?.dateTime;
        const startStr = event.start?.dateTime || event.start?.date;
        const endStr = event.end?.dateTime || event.end?.date;
        if (!startStr || !endStr) continue;
        events.push({
          id: event.id,
          summary: event.summary,
          start: startStr,
          end: endStr,
          isAllDay,
          location: event.location ?? undefined,
          description: event.description ?? undefined,
        });
      }
      return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });
}

export type RsvpResponse = 'accepted' | 'tentative' | 'declined';

export function respondToEvent(
  accountId: string | undefined,
  eventId: string,
  response: RsvpResponse
): Promise<void> {
  const calendar = getCalendarClient(accountId);
  return calendar.events
    .patch({
      calendarId: 'primary',
      eventId,
      requestBody: { responseStatus: response } as import('googleapis').calendar_v3.Schema$Event,
    })
    .then(() => undefined);
}

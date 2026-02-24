export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
  accountId?: string;
  calendarId?: string;
  eventType?: 'physical' | 'virtual' | 'unknown';
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
type CacheEntry = { events: CalendarEvent[]; fetchedAt: number };
const eventCache = new Map<string, CacheEntry>();

const CACHE_KEY_SEP = '\x00';
function cacheKey(accountIds: string[], timeMin: string, timeMax: string): string {
  const ids = [...accountIds].sort();
  return `${ids.join('|')}${CACHE_KEY_SEP}${timeMin}${CACHE_KEY_SEP}${timeMax}`;
}

function rangesOverlap(aMin: string, aMax: string, bStart: string, bEnd: string): boolean {
  const aMinT = new Date(aMin).getTime();
  const aMaxT = new Date(aMax).getTime();
  const bStartT = new Date(bStart).getTime();
  const bEndT = new Date(bEnd).getTime();
  return aMinT < bEndT && aMaxT > bStartT;
}

function invalidateOverlapping(accountId: string, start: string, end: string): void {
  for (const key of eventCache.keys()) {
    const parts = key.split(CACHE_KEY_SEP);
    if (parts.length !== 3) continue;
    const [, timeMin, timeMax] = parts;
    if (!parts[0].includes(accountId)) continue;
    if (rangesOverlap(timeMin, timeMax, start, end)) eventCache.delete(key);
  }
}

function invalidateAllForAccount(accountId: string): void {
  for (const key of eventCache.keys()) {
    const idsPart = key.split(CACHE_KEY_SEP)[0] ?? '';
    if (idsPart.includes(accountId)) eventCache.delete(key);
  }
}

function getCalendarAPI() {
  return window.electronAPI?.calendar;
}

function getReminderAPI() {
  return window.electronAPI?.reminder;
}

export async function fetchEvents(accountId: string | undefined, daysAhead: number = 14): Promise<CalendarEvent[]> {
  const api = getCalendarAPI();
  if (!api) return [];
  return api.listEvents(accountId, daysAhead);
}

export async function fetchEventsRange(
  accountId: string | undefined,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const api = getCalendarAPI();
  if (!api) return [];
  const events = await api.listEventsRange(accountId, timeMin, timeMax);
  return events.map((e) => ({ ...e, accountId: accountId ?? undefined }));
}

/** Returns cached events for the range if available and not expired, or null. */
export function getCachedEventsForAccounts(
  accountIds: string[],
  timeMin: string,
  timeMax: string,
): CalendarEvent[] | null {
  const key = cacheKey(accountIds, timeMin, timeMax);
  const ent = eventCache.get(key);
  if (!ent) return null;
  if (Date.now() - ent.fetchedAt > CACHE_TTL_MS) return null;
  return ent.events;
}

export async function fetchEventsForAccounts(
  accountIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const key = cacheKey(accountIds, timeMin, timeMax);
  const cached = eventCache.get(key);
  if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
    return cached.events;
  }
  const results = await Promise.allSettled(
    accountIds.map((id) => fetchEventsRange(id, timeMin, timeMax)),
  );
  const all: CalendarEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  const sorted = all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  eventCache.set(key, { events: sorted, fetchedAt: Date.now() });
  return sorted;
}

export async function getReminderMinutes(): Promise<number> {
  const api = getReminderAPI();
  if (!api) return 15;
  return api.getMinutes();
}

export async function setReminderMinutes(minutes: number): Promise<void> {
  const api = getReminderAPI();
  if (!api) return;
  return api.setMinutes(minutes);
}

export interface CalendarEventInput {
  summary?: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  recurrence?: string[];
  reminderMinutes?: number;
}

export async function createEvent(
  accountId: string | undefined,
  calendarId: string,
  event: CalendarEventInput
): Promise<CalendarEvent> {
  const api = getCalendarAPI();
  if (!api?.createEvent) throw new Error('Calendar API not available');
  const created = await api.createEvent(accountId, calendarId, event);
  if (accountId) invalidateOverlapping(accountId, event.start, event.end);
  return { ...created, accountId: accountId ?? undefined };
}

export async function updateEvent(
  accountId: string | undefined,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput
): Promise<CalendarEvent> {
  const api = getCalendarAPI();
  if (!api?.updateEvent) throw new Error('Calendar API not available');
  const updated = await api.updateEvent(accountId, calendarId, eventId, event);
  if (accountId) invalidateOverlapping(accountId, event.start, event.end);
  return { ...updated, accountId: accountId ?? undefined };
}

export async function deleteEvent(
  accountId: string | undefined,
  calendarId: string,
  eventId: string
): Promise<void> {
  const api = getCalendarAPI();
  if (!api?.deleteEvent) throw new Error('Calendar API not available');
  await api.deleteEvent(accountId, calendarId, eventId);
  if (accountId) invalidateAllForAccount(accountId);
}

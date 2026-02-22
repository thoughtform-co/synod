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

export async function fetchEventsForAccounts(
  accountIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const results = await Promise.allSettled(
    accountIds.map((id) => fetchEventsRange(id, timeMin, timeMax)),
  );
  const all: CalendarEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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

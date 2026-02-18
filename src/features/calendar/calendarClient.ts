export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string;
  description?: string;
}

function getCalendarAPI() {
  return (window as Window & { electronAPI?: { calendar?: { listEvents: (days?: number) => Promise<CalendarEvent[]> } } })
    .electronAPI?.calendar;
}

function getReminderAPI() {
  return (window as Window & { electronAPI?: { reminder?: { getMinutes: () => Promise<number>; setMinutes: (m: number) => Promise<void> } } })
    .electronAPI?.reminder;
}

export async function fetchEvents(daysAhead: number = 14): Promise<CalendarEvent[]> {
  const api = getCalendarAPI();
  if (!api) return [];
  return api.listEvents(daysAhead);
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

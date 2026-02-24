/**
 * Lightweight ICS (iCalendar) text parser.
 * Extracts SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION, ORGANIZER, METHOD from a single VEVENT.
 */

export interface ParsedIcsEvent {
  summary?: string;
  dtStart?: string; // ISO or date string
  dtEnd?: string;
  location?: string;
  description?: string;
  organizer?: string;
  method?: string; // REQUEST, REPLY, CANCEL, etc.
  eventId?: string; // UID
}

const LINE_FOLD = /[\r\n]+[ \t]/g;
const LINE_SPLIT = /[\r\n]+/;

function unfold(ics: string): string {
  return ics.replace(LINE_FOLD, '');
}

function parseParamValue(line: string): { key: string; value: string } {
  const colon = line.indexOf(':');
  if (colon === -1) return { key: '', value: '' };
  const keyPart = line.slice(0, colon).trim().toUpperCase();
  const value = line.slice(colon + 1).trim();
  const key = keyPart.includes(';') ? keyPart.split(';')[0].trim() : keyPart;
  return { key, value };
}

function icsDateToIso(value: string): string {
  if (!value) return value;
  const s = value.replace(/\s/g, '');
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (s.length >= 15) {
    const date = s.slice(0, 8);
    const time = s.slice(9, 15);
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  }
  return value;
}

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function parseIcs(icsText: string): ParsedIcsEvent | null {
  if (!icsText || typeof icsText !== 'string') return null;
  const unfolded = unfold(icsText);
  const lines = unfolded.split(LINE_SPLIT).map((l) => l.trim()).filter(Boolean);

  let inEvent = false;
  const result: ParsedIcsEvent = {};

  for (const line of lines) {
    const { key, value } = parseParamValue(line);
    if (key === 'BEGIN' && value === 'VEVENT') {
      inEvent = true;
      continue;
    }
    if (key === 'END' && value === 'VEVENT') {
      break;
    }
    if (!inEvent) continue;

    switch (key) {
      case 'SUMMARY':
        result.summary = unescapeIcs(value);
        break;
      case 'DTSTART':
        result.dtStart = icsDateToIso(value);
        break;
      case 'DTEND':
        result.dtEnd = icsDateToIso(value);
        break;
      case 'LOCATION':
        result.location = unescapeIcs(value);
        break;
      case 'DESCRIPTION':
        result.description = unescapeIcs(value);
        break;
      case 'ORGANIZER': {
        const mailto = value.replace(/^mailto:/i, '').trim();
        result.organizer = mailto || value;
        break;
      }
      case 'METHOD':
        result.method = value.toUpperCase();
        break;
      case 'UID':
        result.eventId = value;
        break;
      default:
        break;
    }
  }

  if (!result.dtStart && !result.summary) return null;
  return result;
}

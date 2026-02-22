/**
 * Format an RFC 2822 email date string for display (no timezone suffix, no seconds).
 * Falls back to raw string if parsing fails.
 */
export function formatEmailDate(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return raw ?? '';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const day = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const datePart = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${day}, ${datePart} ${timePart}`;
  } catch {
    return raw;
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Format epoch ms for thread list: within week "SAT 14:11", same year "FEB 21 14:11", else "21/02/2025".
 */
export function formatThreadListDate(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - ms;
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (diff >= 0 && diff < WEEK_MS) {
    const day = d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
    return `${day} ${timePart}`;
  }
  const thisYear = new Date(now).getFullYear();
  if (d.getFullYear() === thisYear) {
    const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    return `${month} ${day} ${timePart}`;
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

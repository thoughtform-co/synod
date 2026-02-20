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

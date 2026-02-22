import { describe, it, expect } from 'vitest';
import { formatEmailDate } from './utils';

describe('formatEmailDate', () => {
  it('returns empty string for undefined', () => {
    expect(formatEmailDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatEmailDate('')).toBe('');
  });

  it('formats valid ISO-like date', () => {
    const result = formatEmailDate('Mon, 22 Feb 2026 14:30:00 +0000');
    expect(result).toMatch(/\d{2}/);
    expect(result).toMatch(/Feb/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('returns raw string when parsing fails', () => {
    expect(formatEmailDate('not-a-date')).toBe('not-a-date');
  });
});

import { describe, it, expect } from 'vitest';
import { safeParse } from './safeJson';

describe('safeParse', () => {
  it('parses valid JSON', () => {
    expect(safeParse('{"a":1}', null)).toEqual({ a: 1 });
    expect(safeParse('[1,2]', [])).toEqual([1, 2]);
  });

  it('returns fallback for invalid JSON', () => {
    const fallback = { x: 0 };
    expect(safeParse('{ invalid', fallback)).toBe(fallback);
    expect(safeParse('', fallback)).toBe(fallback);
  });
});

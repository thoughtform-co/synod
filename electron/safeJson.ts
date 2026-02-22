/**
 * Safe JSON parse for values read from DB or IPC. Prevents main process crash on corrupted data.
 */
export function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

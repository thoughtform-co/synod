/**
 * Retry wrapper for Google API calls. Exponential backoff with jitter.
 */

const DEFAULT_MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;

function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: number }).code;
    if (code === 401 || code === 403 || code === 400) return false;
    if (code === 429 || code >= 500) return true;
  }
  if (err instanceof Error && /network|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message)) return true;
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  return Math.floor(ms * (0.5 + Math.random() * 0.5));
}

/**
 * Run a promise-returning function with retries. Uses exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRetryable(err)) throw err;
      const baseDelay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      await delay(jitter(baseDelay));
    }
  }
  throw lastErr;
}

/**
 * Lightweight client-side metrics for performance monitoring.
 * Tracks thread fetch latency and cache hits for tuning and alerts.
 */

let threadFetchCount = 0;
let threadCacheHitCount = 0;
const threadFetchDurationsMs: number[] = [];
const MAX_SAMPLES = 100;

export function recordThreadFetchDurationMs(ms: number): void {
  threadFetchCount++;
  threadFetchDurationsMs.push(ms);
  if (threadFetchDurationsMs.length > MAX_SAMPLES) threadFetchDurationsMs.shift();
}

export function recordThreadCacheHit(): void {
  threadCacheHitCount++;
}

export function getThreadCacheHitRate(): number {
  const total = threadFetchCount + threadCacheHitCount;
  return total === 0 ? 0 : threadCacheHitCount / total;
}

export function getThreadFetchP95Ms(): number {
  if (threadFetchDurationsMs.length === 0) return 0;
  const sorted = [...threadFetchDurationsMs].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

export function getMetricsSnapshot(): { cacheHitRate: number; fetchP95Ms: number } {
  return {
    cacheHitRate: getThreadCacheHitRate(),
    fetchP95Ms: getThreadFetchP95Ms(),
  };
}

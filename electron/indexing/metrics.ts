/**
 * Observability metrics for indexing and search.
 * In-memory counters and last latencies; no persistence.
 */

export interface IndexingMetrics {
  lastIngestionStartTime: number | null;
  lastIngestionEndTime: number | null;
  lastEmbedLatencyMs: number | null;
  indexSuccessTotal: number;
  indexFailureTotal: number;
  lastKeywordQueryLatencyMs: number | null;
  lastSemanticQueryLatencyMs: number | null;
  keywordQueryCount: number;
  semanticQueryCount: number;
}

const metrics: IndexingMetrics = {
  lastIngestionStartTime: null,
  lastIngestionEndTime: null,
  lastEmbedLatencyMs: null,
  indexSuccessTotal: 0,
  indexFailureTotal: 0,
  lastKeywordQueryLatencyMs: null,
  lastSemanticQueryLatencyMs: null,
  keywordQueryCount: 0,
  semanticQueryCount: 0,
};

export function getMetrics(): IndexingMetrics {
  return { ...metrics };
}

export function recordIngestionStart(): void {
  metrics.lastIngestionStartTime = Date.now();
}

export function recordIngestionEnd(): void {
  metrics.lastIngestionEndTime = Date.now();
}

export function recordEmbedLatencyMs(ms: number): void {
  metrics.lastEmbedLatencyMs = ms;
}

export function recordIndexSuccess(count: number): void {
  metrics.indexSuccessTotal += count;
}

export function recordIndexFailure(count: number): void {
  metrics.indexFailureTotal += count;
}

export function recordKeywordQueryLatencyMs(ms: number): void {
  metrics.keywordQueryCount++;
  metrics.lastKeywordQueryLatencyMs = ms;
}

export function recordSemanticQueryLatencyMs(ms: number): void {
  metrics.semanticQueryCount++;
  metrics.lastSemanticQueryLatencyMs = ms;
}

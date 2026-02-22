/**
 * Text embeddings for semantic search.
 * Uses Voyage AI (recommended by Anthropic) with 1024 dimensions; falls back to stub when no API key.
 */

export const EMBEDDING_DIMENSION = 1024;

const VOYAGE_EMBED_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';

export interface EmbedderConfig {
  apiKey?: string;
  dimension?: number;
}

let cachedApiKey: string | null = null;

export function setEmbedderApiKey(key: string | null): void {
  cachedApiKey = key ?? null;
}

function getApiKey(): string | null {
  if (cachedApiKey) return cachedApiKey;
  return process.env.VOYAGE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? null;
}

/**
 * Embed a single text. Returns zero vector if no API key (stub mode).
 */
export async function embedText(text: string, config?: EmbedderConfig): Promise<number[]> {
  const apiKey = config?.apiKey ?? getApiKey();
  if (!apiKey) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
  const res = await fetch(VOYAGE_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 32000),
      model: VOYAGE_MODEL,
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage embed failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Voyage returned invalid embedding (length ${embedding?.length ?? 0})`);
  }
  return embedding;
}

/**
 * Embed multiple texts in one request (batch). Falls back to stub if no API key.
 */
export async function embedBatch(texts: string[], config?: EmbedderConfig): Promise<number[][]> {
  const apiKey = config?.apiKey ?? getApiKey();
  if (!apiKey) {
    return texts.map(() => new Array(EMBEDDING_DIMENSION).fill(0));
  }
  const inputs = texts.map((t) => t.slice(0, 32000));
  const res = await fetch(VOYAGE_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: VOYAGE_MODEL,
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage embed batch failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embeddings = (data.data ?? []).map(
    (d) => d.embedding ?? new Array(EMBEDDING_DIMENSION).fill(0)
  );
  if (embeddings.length !== texts.length) {
    throw new Error(`Voyage returned ${embeddings.length} embeddings for ${texts.length} inputs`);
  }
  return embeddings;
}

/**
 * Canonical email document and chunk model for cloud indexing.
 * Used by ingestion pipeline, search, and graph projection.
 */

export interface EmailDocument {
  accountId: string;
  threadId: string;
  messageId: string;
  internalDate: number;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  labelIds: string[];
  attachmentsMeta: { filename: string; mimeType: string; size: number }[];
  snippet: string;
}

export interface EmailChunk {
  chunkId: string;
  accountId: string;
  threadId: string;
  messageId: string;
  internalDate: number;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  labelIds: string[];
  attachmentsMeta: { filename: string; mimeType: string; size: number }[];
  snippet: string;
  /** 0-based index when message is split into multiple chunks */
  chunkIndex: number;
  /** Character range or section label for this chunk */
  chunkKind: 'full' | 'body' | 'quote';
}

export type EmailCategory =
  | 'main'
  | 'subscription'
  | 'promotion'
  | 'social'
  | 'update'
  | 'transactional'
  | 'other';

export interface CategorizedChunk extends EmailChunk {
  category: EmailCategory;
  priorityScore: number;
  subscriptionFingerprint?: string;
}

export interface IndexedChunk extends CategorizedChunk {
  embedding?: number[];
  ftsVector?: string;
}

export interface SearchResult {
  chunkId: string;
  messageId: string;
  threadId: string;
  accountId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: number;
  category: EmailCategory;
  score: number;
  explanation?: string;
}

export interface SubscriptionOverviewItem {
  senderDomain: string;
  senderName?: string;
  fingerprint: string;
  messageCount: number;
  firstSeen: number;
  lastSeen: number;
  category: EmailCategory;
}

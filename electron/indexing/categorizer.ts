/**
 * Gmail-label-aware categorization and priority scoring.
 * Maps labels + heuristics to category and a numeric priority (higher = more relevant).
 */

import type { EmailChunk, EmailCategory, CategorizedChunk } from './types';

const LABEL_CATEGORY: Record<string, EmailCategory> = {
  INBOX: 'main',
  SENT: 'main',
  DRAFT: 'main',
  IMPORTANT: 'main',
  CATEGORY_PERSONAL: 'main',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_PROMOTIONS: 'promotion',
  CATEGORY_UPDATES: 'update',
  CATEGORY_FORUMS: 'subscription',
  UNREAD: 'main', // neutral, doesn't change category
  STARRED: 'main',
  TRASH: 'other',
  SPAM: 'other',
};

const PRIORITY_BOOST = {
  main: 1.0,
  transactional: 0.8,
  update: 0.5,
  social: 0.4,
  subscription: 0.3,
  promotion: 0.1,
  other: 0.2,
};

/** List-id / list-unsubscribe style fingerprint for subscription identity */
export function subscriptionFingerprint(from: string, headers?: { listId?: string; listUnsubscribe?: string }): string {
  const domain = from.includes('@') ? from.split('@')[1]?.toLowerCase() ?? '' : '';
  const listId = headers?.listId?.trim().toLowerCase() ?? '';
  const key = listId || domain;
  return key ? `sub:${key}` : '';
}

/**
 * Categorize a chunk from Gmail labelIds. Optionally compute subscription fingerprint from from/list headers.
 */
export function categorizeChunk(
  chunk: EmailChunk,
  options?: { listId?: string; listUnsubscribe?: string }
): CategorizedChunk {
  const labelIds = chunk.labelIds ?? [];
  let category: EmailCategory = 'other';
  for (const lid of labelIds) {
    const c = LABEL_CATEGORY[lid];
    if (c) {
      category = c;
      break;
    }
  }
  if (category === 'other' && labelIds.length === 0) {
    category = 'main';
  }
  const priorityScore = PRIORITY_BOOST[category];
  const subscriptionFingerprintVal =
    category === 'subscription' || category === 'promotion'
      ? subscriptionFingerprint(chunk.from, { listId: options?.listId, listUnsubscribe: options?.listUnsubscribe })
      : undefined;
  return {
    ...chunk,
    category,
    priorityScore,
    subscriptionFingerprint: subscriptionFingerprintVal || undefined,
  };
}

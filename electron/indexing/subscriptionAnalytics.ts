/**
 * Subscription timeline and overview: aggregate by subscription_fingerprint / sender domain.
 */

import type { SubscriptionOverviewItem } from './types';
import type { EmailCategory } from './types';
import { getPgClient, isIndexingConfigured } from './postgresClient';

export { isIndexingConfigured as isSubscriptionAnalyticsConfigured };

async function getClient(): Promise<import('pg').Client | null> {
  return getPgClient();
}

/**
 * Get subscription overview: one row per subscription fingerprint (or sender domain),
 * with message count, first/last seen, category.
 */
export async function getSubscriptionOverview(
  accountIds: string[]
): Promise<SubscriptionOverviewItem[]> {
  const pg = await getClient();
  if (!pg) return [];

  const accountFilter =
    accountIds.length > 0 ? `WHERE account_id = ANY($1)` : '';
  const params = accountIds.length > 0 ? [accountIds] : [];

  const res = await pg.query(
    `SELECT
       COALESCE(subscription_fingerprint, 'domain:' || LOWER(SPLIT_PART(from_addr, '@', 2))) AS fingerprint,
       LOWER(SPLIT_PART(from_addr, '@', 2)) AS sender_domain,
       MIN(from_addr) AS sender_name,
       COUNT(DISTINCT message_id) AS message_count,
       MIN(internal_date) AS first_seen,
       MAX(internal_date) AS last_seen,
       MODE() WITHIN GROUP (ORDER BY category) AS category
     FROM mail_chunks
     ${accountFilter}
     GROUP BY subscription_fingerprint, LOWER(SPLIT_PART(from_addr, '@', 2))
     HAVING COUNT(*) > 0
     ORDER BY last_seen DESC`,
    params
  );

  return res.rows.map((r) => ({
    senderDomain: r.sender_domain ?? '',
    senderName: r.sender_name ?? undefined,
    fingerprint: r.fingerprint ?? '',
    messageCount: parseInt(r.message_count, 10) || 0,
    firstSeen: parseInt(r.first_seen, 10) || 0,
    lastSeen: parseInt(r.last_seen, 10) || 0,
    category: (r.category ?? 'other') as EmailCategory,
  }));
}

/**
 * Subscription timeline: message count per time bucket (e.g. per month) for a given fingerprint or account.
 */
export async function getSubscriptionTimeline(
  accountId: string,
  fingerprint?: string,
  bucketDays: number = 30
): Promise<{ bucketStart: number; count: number }[]> {
  const pg = await getClient();
  if (!pg) return [];

  const bucketMs = bucketDays * 24 * 60 * 60 * 1000;
  const fingerprintFilter = fingerprint
    ? `AND (subscription_fingerprint = $2 OR COALESCE(subscription_fingerprint, 'domain:' || LOWER(SPLIT_PART(from_addr, '@', 2))) = $2)`
    : '';
  const params = fingerprint ? [accountId, fingerprint] : [accountId];

  const res = await pg.query(
    `SELECT
       (FLOOR(internal_date / $${params.length + 1})::bigint * $${params.length + 1}) AS bucket_start,
       COUNT(DISTINCT message_id) AS cnt
     FROM mail_chunks
     WHERE account_id = $1 ${fingerprintFilter}
     GROUP BY 1
     ORDER BY 1`,
    [...params, bucketMs]
  );

  return res.rows.map((r) => ({
    bucketStart: parseInt(r.bucket_start, 10) || 0,
    count: parseInt(r.cnt, 10) || 0,
  }));
}

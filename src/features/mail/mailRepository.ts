import { sanitizeHtml } from '@/lib/sanitizeHtml';

function getGmailAPI() {
  return typeof window !== 'undefined' ? window.electronAPI?.gmail : undefined;
}

const inFlightThreadRequests = new Map<string, Promise<ThreadDetail | null>>();

/** LRU + TTL thread cache (renderer-side). */
const THREAD_CACHE_MAX = 50;
const THREAD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  thread: ThreadDetail;
  at: number;
}

const threadCache = new Map<string, CacheEntry>();
const threadCacheKeyOrder: string[] = [];

function threadCacheKey(accountId: string | undefined, threadId: string): string {
  return `${accountId ?? '__active__'}::${threadId}`;
}

function pruneThreadCache(): void {
  const now = Date.now();
  while (threadCacheKeyOrder.length > 0) {
    const key = threadCacheKeyOrder[0];
    const entry = threadCache.get(key);
    if (!entry || now - entry.at > THREAD_CACHE_TTL_MS || threadCache.size > THREAD_CACHE_MAX) {
      threadCacheKeyOrder.shift();
      threadCache.delete(key);
    } else break;
  }
  while (threadCache.size > THREAD_CACHE_MAX && threadCacheKeyOrder.length > 0) {
    const key = threadCacheKeyOrder.shift()!;
    threadCache.delete(key);
  }
}

export function getThreadFromCache(accountId: string | undefined, threadId: string): ThreadDetail | null {
  const key = threadCacheKey(accountId, threadId);
  const entry = threadCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > THREAD_CACHE_TTL_MS) {
    threadCache.delete(key);
    const i = threadCacheKeyOrder.indexOf(key);
    if (i !== -1) threadCacheKeyOrder.splice(i, 1);
    return null;
  }
  return entry.thread;
}

export function invalidateThreadCache(accountId: string | undefined, threadId: string): void {
  const key = threadCacheKey(accountId, threadId);
  threadCache.delete(key);
  const i = threadCacheKeyOrder.indexOf(key);
  if (i !== -1) threadCacheKeyOrder.splice(i, 1);
}

export interface ThreadSummary {
  id: string;
  snippet: string;
  subject?: string;
  from?: string;
  internalDate?: number;
}

export async function fetchInboxThreads(
  accountId: string | undefined,
  maxResults: number = 30,
  pageToken?: string
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const gmail = getGmailAPI();
  if (!gmail) return { threads: [] };
  const { threads, nextPageToken } = await gmail.listThreads(accountId, 'INBOX', maxResults, pageToken);
  return {
    threads: threads.map((t) => ({ id: t.id, snippet: t.snippet, subject: t.subject, from: t.from, internalDate: t.internalDate })),
    nextPageToken,
  };
}

export type MailView = { type: 'label'; labelId: string } | { type: 'query'; query: string };

/**
 * Fetch thread list for the current view. Served local-first from SQLite (IPC);
 * refetch when sync status is 'up-to-date' to show background updates.
 */
export async function fetchThreadsByView(
  accountId: string | undefined,
  view: MailView,
  maxResults: number = 30,
  pageToken?: string
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const gmail = getGmailAPI();
  if (!gmail) return { threads: [] };
  if (view.type === 'query') {
    const { threads, nextPageToken } = await gmail.searchThreads(accountId, view.query, maxResults, pageToken);
    return { threads: threads.map((t) => ({ id: t.id, snippet: t.snippet, subject: t.subject, from: t.from, internalDate: t.internalDate })), nextPageToken };
  }
  const { threads, nextPageToken } = await gmail.listThreads(accountId, view.labelId, maxResults, pageToken);
  return { threads: threads.map((t) => ({ id: t.id, snippet: t.snippet, subject: t.subject, from: t.from, internalDate: t.internalDate })), nextPageToken };
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyPlain: string;
  bodyHtml: string;
  snippet: string;
  attachments?: { filename: string; mimeType: string; size: number; attachmentId: string }[];
}

export interface ThreadDetail {
  id: string;
  messages: ThreadMessage[];
}

/**
 * Fetch one thread. Served from in-memory cache or SQLite first (IPC); refetch on
 * sync 'up-to-date' to show background updates. LRU cache is L1 on top of SQLite L2.
 */
export async function fetchThread(accountId: string | undefined, threadId: string): Promise<ThreadDetail | null> {
  const gmail = getGmailAPI();
  if (!gmail) return null;
  const requestKey = threadCacheKey(accountId, threadId);
  const existing = inFlightThreadRequests.get(requestKey);
  if (existing) return existing;
  const requestPromise = (async () => {
    const { id, messages } = await gmail.getThread(accountId, threadId);
    const mappedMessages = messages.map((m) => ({
      id: m.id,
      from: m.from ?? '',
      to: m.to ?? '',
      subject: m.subject ?? '',
      date: m.date ?? '',
      bodyPlain: m.bodyPlain || m.snippet,
      bodyHtml: m.bodyHtml ? sanitizeHtml(m.bodyHtml) : '',
      snippet: m.snippet,
      attachments: m.attachments,
    }));
    const thread: ThreadDetail = { id, messages: mappedMessages };
    pruneThreadCache();
    const keyOrderIdx = threadCacheKeyOrder.indexOf(requestKey);
    if (keyOrderIdx !== -1) threadCacheKeyOrder.splice(keyOrderIdx, 1);
    threadCacheKeyOrder.push(requestKey);
    threadCache.set(requestKey, { thread, at: Date.now() });
    return thread;
  })();
  inFlightThreadRequests.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightThreadRequests.delete(requestKey);
  }
}

export async function sendReply(accountId: string | undefined, threadId: string, bodyText: string): Promise<{ id: string }> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  const result = await gmail.sendReply(accountId, threadId, bodyText);
  invalidateThreadCache(accountId, threadId);
  return result;
}

/** Done = archive + mark read: remove INBOX and UNREAD. */
export async function doneThread(accountId: string | undefined, threadId: string): Promise<void> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  await gmail.modifyLabels(accountId, threadId, [], ['INBOX', 'UNREAD']);
  invalidateThreadCache(accountId, threadId);
}

export async function deleteThread(accountId: string | undefined, threadId: string): Promise<void> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  await gmail.trashThread(accountId, threadId);
  invalidateThreadCache(accountId, threadId);
}

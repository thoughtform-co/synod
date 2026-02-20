import { sanitizeHtml } from '@/lib/sanitizeHtml';

function getGmailAPI() {
  return typeof window !== 'undefined' ? window.electronAPI?.gmail : undefined;
}

const inFlightThreadRequests = new Map<string, Promise<ThreadDetail | null>>();

export interface ThreadSummary {
  id: string;
  snippet: string;
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
    threads: threads.map((t) => ({ id: t.id, snippet: t.snippet })),
    nextPageToken,
  };
}

export type MailView = { type: 'label'; labelId: string } | { type: 'query'; query: string };

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
    return { threads: threads.map((t) => ({ id: t.id, snippet: t.snippet })), nextPageToken };
  }
  const { threads, nextPageToken } = await gmail.listThreads(accountId, view.labelId, maxResults, pageToken);
  return { threads: threads.map((t) => ({ id: t.id, snippet: t.snippet })), nextPageToken };
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
}

export interface ThreadDetail {
  id: string;
  messages: ThreadMessage[];
}

export async function fetchThread(accountId: string | undefined, threadId: string): Promise<ThreadDetail | null> {
  const gmail = getGmailAPI();
  if (!gmail) return null;
  const requestKey = `${accountId ?? '__active__'}::${threadId}`;
  const existing = inFlightThreadRequests.get(requestKey);
  if (existing) {
    return existing;
  }
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
  }));
  return {
    id,
    messages: mappedMessages,
  };
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
  return gmail.sendReply(accountId, threadId, bodyText);
}

/** Done = archive + mark read: remove INBOX and UNREAD. */
export async function doneThread(accountId: string | undefined, threadId: string): Promise<void> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  return gmail.modifyLabels(accountId, threadId, [], ['INBOX', 'UNREAD']);
}

export async function deleteThread(accountId: string | undefined, threadId: string): Promise<void> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  return gmail.trashThread(accountId, threadId);
}

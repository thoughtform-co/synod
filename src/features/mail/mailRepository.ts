import type { GmailMessage } from '@/vite-env.d';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

function getGmailAPI() {
  return typeof window !== 'undefined' ? window.electronAPI?.gmail : undefined;
}

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

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function getHeader(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers;
  if (!headers) return '';
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

type PartLike = {
  mimeType?: string;
  body?: { data?: string };
  parts?: PartLike[];
};

function collectBodiesFromPart(part: PartLike): { plain: string; html: string } {
  let plain = '';
  let html = '';
  const mime = (part.mimeType ?? '').toLowerCase();

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime === 'text/plain') plain = decoded;
    else if (mime === 'text/html') html = decoded;
  }

  if (part.parts?.length) {
    for (const p of part.parts) {
      const child = collectBodiesFromPart(p);
      if (child.plain) plain = child.plain;
      if (child.html) html = child.html;
    }
  }

  return { plain, html };
}

function getBodyPlain(msg: GmailMessage): string {
  const payload = msg.payload;
  if (!payload) return msg.snippet;
  const root: PartLike = {
    mimeType: payload.mimeType,
    body: payload.body,
    parts: payload.parts,
  };
  const { plain, html } = collectBodiesFromPart(root);
  if (plain) return plain;
  if (html) return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return msg.snippet;
}

function getBodyHtml(msg: GmailMessage): string {
  const payload = msg.payload;
  if (!payload) return '';
  const root: PartLike = {
    mimeType: payload.mimeType,
    body: payload.body,
    parts: payload.parts,
  };
  const { html } = collectBodiesFromPart(root);
  if (html) return sanitizeHtml(html);
  if (payload.body?.data && (payload.mimeType ?? '').toLowerCase() === 'text/html') {
    return sanitizeHtml(decodeBase64Url(payload.body.data));
  }
  return '';
}

export async function fetchThread(accountId: string | undefined, threadId: string): Promise<ThreadDetail | null> {
  const gmail = getGmailAPI();
  if (!gmail) return null;
  const { id, messages } = await gmail.getThread(accountId, threadId);
  return {
    id,
    messages: messages.map((m) => ({
      id: m.id,
      from: getHeader(m, 'From'),
      to: getHeader(m, 'To'),
      subject: getHeader(m, 'Subject'),
      date: getHeader(m, 'Date'),
      bodyPlain: getBodyPlain(m),
      bodyHtml: getBodyHtml(m),
      snippet: m.snippet,
    })),
  };
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

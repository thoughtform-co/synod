import type { GmailMessage } from '@/vite-env.d';

function getGmailAPI() {
  return (window as Window & { electronAPI?: { gmail?: typeof window.electronAPI.gmail } }).electronAPI?.gmail;
}

export interface ThreadSummary {
  id: string;
  snippet: string;
}

export async function fetchInboxThreads(
  maxResults: number = 30,
  pageToken?: string
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const gmail = getGmailAPI();
  if (!gmail) return { threads: [] };
  const { threads, nextPageToken } = await gmail.listThreads('INBOX', maxResults, pageToken);
  return {
    threads: threads.map((t) => ({ id: t.id, snippet: t.snippet })),
    nextPageToken,
  };
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyPlain: string;
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

function getBodyPlain(msg: GmailMessage): string {
  const payload = msg.payload;
  if (!payload) return msg.snippet;
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  const parts = payload.parts;
  if (parts) {
    const textPart = parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return msg.snippet;
}

export async function fetchThread(threadId: string): Promise<ThreadDetail | null> {
  const gmail = getGmailAPI();
  if (!gmail) return null;
  const { id, messages } = await gmail.getThread(threadId);
  return {
    id,
    messages: messages.map((m) => ({
      id: m.id,
      from: getHeader(m, 'From'),
      to: getHeader(m, 'To'),
      subject: getHeader(m, 'Subject'),
      date: getHeader(m, 'Date'),
      bodyPlain: getBodyPlain(m),
      snippet: m.snippet,
    })),
  };
}

export async function sendReply(threadId: string, bodyText: string): Promise<{ id: string }> {
  const gmail = getGmailAPI();
  if (!gmail) throw new Error('Gmail not available');
  return gmail.sendReply(threadId, bodyText);
}

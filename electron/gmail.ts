import { google } from 'googleapis';
import { getDb } from './db';

const LABEL_INBOX = 'INBOX';
const LABEL_SENT = 'SENT';
const LABEL_DRAFT = 'DRAFT';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}

function getGmailClient() {
  const db = getDb();
  if (!db) throw new Error('Database not initialized');

  const account = getStoredJson(db, 'account') as { email?: string } | null;
  const email = account?.email;
  if (!email) throw new Error('No account connected');

  const clientId = getStoredJson(db, 'google_client_id') as string | null;
  const clientSecret = getStoredJson(db, 'google_client_secret') as string | null;
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not stored');

  const row = db.prepare('SELECT tokens FROM accounts WHERE id = ?').get(email) as { tokens: string } | undefined;
  if (!row) throw new Error('No tokens for account');
  const tokens = JSON.parse(row.tokens) as {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/oauth2callback');
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export interface ThreadSummary {
  id: string;
  snippet: string;
  historyId?: string;
  messages?: { id: string; labelIds?: string[] }[];
}

export interface ListThreadsResult {
  threads: ThreadSummary[];
  nextPageToken?: string;
}

export function listThreads(labelId: string, maxResults: number, pageToken?: string): Promise<ListThreadsResult> {
  const gmail = getGmailClient();
  return gmail.users.threads
    .list({
      userId: 'me',
      labelIds: [labelId],
      maxResults: Math.min(maxResults, 50),
      pageToken: pageToken || undefined,
    })
    .then((res) => {
      const threads: ThreadSummary[] = (res.data.threads || []).map((t) => ({
        id: t.id!,
        snippet: t.snippet || '',
        historyId: t.historyId ? String(t.historyId) : undefined,
        messages: t.messages?.map((m) => ({ id: m.id!, labelIds: m.labelIds ?? undefined })),
      }));
      return { threads, nextPageToken: res.data.nextPageToken || undefined };
    });
}

export interface MessagePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: MessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    filename?: string;
    body?: { data?: string; size?: number };
    parts?: MessagePart[];
  };
}

export function getThread(threadId: string): Promise<{ id: string; messages: GmailMessage[] }> {
  const gmail = getGmailClient();
  return gmail.users.threads
    .get({
      userId: 'me',
      id: threadId,
      format: 'full',
    })
    .then((res) => {
      const thread = res.data;
      const messages: GmailMessage[] = (thread.messages || []).map((m) => {
        const p = m.payload;
        return {
          id: m.id!,
          threadId: thread.id!,
          labelIds: m.labelIds || [],
          snippet: m.snippet || '',
          payload: p
            ? {
                headers: (p.headers || []).map((h) => ({ name: h.name ?? '', value: h.value ?? '' })),
                mimeType: p.mimeType ?? undefined,
                filename: p.filename ?? undefined,
                body: p.body ? { data: p.body.data ?? undefined, size: p.body.size ?? undefined } : undefined,
                parts: p.parts?.map((part) => ({
                  mimeType: part.mimeType ?? '',
                  body: part.body ? { data: part.body.data ?? undefined, size: part.body.size ?? undefined } : undefined,
                })),
              }
            : undefined,
        };
      });
      return { id: thread.id!, messages };
    });
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sendReply(threadId: string, rawMessage: string): Promise<{ id: string }> {
  const gmail = getGmailClient();
  return gmail.users.messages
    .send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        threadId,
      },
    })
    .then((res) => ({ id: res.data.id! }));
}

export function buildAndSendReply(threadId: string, bodyText: string): Promise<{ id: string }> {
  const gmail = getGmailClient();
  const db = getDb();
  if (!db) throw new Error('Database not initialized');
  const account = getStoredJson(db, 'account') as { email?: string } | null;
  const fromEmail = account?.email || '';

  return gmail.users.threads
    .get({ userId: 'me', id: threadId, format: 'minimal' })
    .then((threadRes) => {
      const firstMsg = threadRes.data.messages?.[0];
      if (!firstMsg) throw new Error('Thread has no messages');
      return gmail.users.messages.get({
        userId: 'me',
        id: firstMsg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Reply-To'],
      });
    })
    .then((msgRes) => {
      const rawHeaders = msgRes.data.payload?.headers || [];
      const headers = rawHeaders.map((h) => ({ name: h.name ?? '', value: h.value ?? '' }));
      const replyTo = getHeader(headers, 'Reply-To') || getHeader(headers, 'From');
      const subject = getHeader(headers, 'Subject');
      const reSubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;

      const lines = [
        `From: ${fromEmail}`,
        `To: ${replyTo}`,
        `Subject: ${reSubject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        bodyText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'),
      ];
      const raw = base64UrlEncode(lines.join('\r\n'));
      return sendReply(threadId, raw);
    });
}

export function getLabelIds(): { INBOX: string; SENT: string; DRAFT: string } {
  return { INBOX: LABEL_INBOX, SENT: LABEL_SENT, DRAFT: LABEL_DRAFT };
}

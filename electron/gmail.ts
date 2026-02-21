import { google } from 'googleapis';
import { getDb } from './db';

const LABEL_INBOX = 'INBOX';
const LABEL_SENT = 'SENT';
const LABEL_DRAFT = 'DRAFT';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}

function getActiveAccountId(db: import('better-sqlite3').Database): string | null {
  const active = getStoredJson(db, 'active_account') as string | null;
  if (active && typeof active === 'string') return active;
  const legacy = getStoredJson(db, 'account') as { email?: string } | null;
  return legacy?.email && typeof legacy.email === 'string' ? legacy.email : null;
}

function getGmailClient(accountId?: string) {
  const db = getDb();
  if (!db) throw new Error('Database not initialized');

  const email = accountId && typeof accountId === 'string' ? accountId : getActiveAccountId(db);
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
  subject?: string;
  from?: string;
  historyId?: string;
  messages?: { id: string; labelIds?: string[] }[];
}

export interface ListThreadsResult {
  threads: ThreadSummary[];
  nextPageToken?: string;
}

function parseFromName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  if (!raw.includes('@')) return raw.trim();
  return raw.trim();
}

async function enrichThreads(gmail: ReturnType<typeof getGmailClient>, threadIds: string[]): Promise<Map<string, { subject?: string; from?: string; snippet?: string }>> {
  const map = new Map<string, { subject?: string; from?: string; snippet?: string }>();
  if (threadIds.length === 0) return map;
  try {
    const results = await Promise.allSettled(
      threadIds.map((id) =>
        gmail.users.threads.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
        } as any)
      )
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const data = r.value.data;
      if (!data.id) continue;
      const msgs = data.messages || [];
      const firstMsg = msgs[0];
      const rawH = firstMsg?.payload?.headers || [];
      const headers = rawH.map((h: any) => ({ name: h.name ?? '', value: h.value ?? '' }));
      const subj = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      map.set(data.id, {
        subject: subj || undefined,
        from: parseFromName(from || undefined),
        snippet: data.snippet || undefined,
      });
    }
  } catch (e) {
    console.error('[gmail] enrichThreads failed, returning partial results:', e);
  }
  return map;
}

export async function listThreads(accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string): Promise<ListThreadsResult> {
  const gmail = getGmailClient(accountId);
  const res = await gmail.users.threads.list({
    userId: 'me',
    labelIds: [labelId],
    maxResults: Math.min(maxResults, 50),
    pageToken: pageToken || undefined,
  });
  const rawThreads = res.data.threads || [];
  const meta = await enrichThreads(gmail, rawThreads.map((t) => t.id!));
  const threads: ThreadSummary[] = rawThreads.map((t) => {
    const m = meta.get(t.id!);
    return {
      id: t.id!,
      snippet: m?.snippet || t.snippet || '',
      subject: m?.subject,
      from: m?.from,
      historyId: t.historyId ? String(t.historyId) : undefined,
    };
  });
  return { threads, nextPageToken: res.data.nextPageToken || undefined };
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
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  bodyPlain?: string;
  bodyHtml?: string;
  payload?: {
    mimeType?: string;
  };
}

function decodeBase64Url(str: string): string {
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBodies(part: any): { plain: string; html: string } {
  let plain = '';
  let html = '';
  const mime: string = (part?.mimeType ?? '').toLowerCase();

  if (part?.body?.data) {
    if (mime === 'text/plain') plain = decodeBase64Url(part.body.data);
    else if (mime === 'text/html') html = decodeBase64Url(part.body.data);
  }

  if (part?.parts) {
    for (const child of part.parts) {
      const r = extractBodies(child);
      if (r.plain) plain = r.plain;
      if (r.html) html = r.html;
    }
  }

  return { plain, html };
}

export function getThread(accountId: string | undefined, threadId: string): Promise<{ id: string; messages: GmailMessage[] }> {
  const gmail = getGmailClient(accountId);
  return gmail.users.threads
    .get({
      userId: 'me',
      id: threadId,
      format: 'full',
    })
    .then((res) => {
      const thread = res.data;
      const rawMessages = (thread.messages || []).map((m) => {
        const p = m.payload;
        const headers = (p?.headers || []).map((h) => ({ name: h.name ?? '', value: h.value ?? '' }));
        const { plain, html } = extractBodies(p);
        return {
          id: m.id!,
          threadId: thread.id!,
          labelIds: m.labelIds || [],
          snippet: m.snippet || '',
          from: getHeader(headers, 'From') || undefined,
          to: getHeader(headers, 'To') || undefined,
          subject: getHeader(headers, 'Subject') || undefined,
          date: getHeader(headers, 'Date') || undefined,
          bodyPlain: plain || undefined,
          bodyHtml: html || undefined,
          payload: p
            ? {
                mimeType: p.mimeType ?? undefined,
              }
            : undefined,
        };
      });
      const HTML_BUDGET = 1_500_000;
      const PLAIN_BUDGET = 300_000;
      const MAX_MESSAGES_WITH_BODY = 3;
      const MAX_HTML_PER_MESSAGE = 80_000;
      const MAX_PLAIN_PER_MESSAGE = 20_000;
      let remainingHtml = HTML_BUDGET;
      let remainingPlain = PLAIN_BUDGET;
      const keepHtml = new Array<boolean>(rawMessages.length).fill(false);
      const keepPlain = new Array<boolean>(rawMessages.length).fill(false);

      // Prioritize newest messages first (thread order is oldest -> newest).
      for (let i = rawMessages.length - 1; i >= 0; i--) {
        const m = rawMessages[i];
        const isRecent = i >= Math.max(0, rawMessages.length - MAX_MESSAGES_WITH_BODY);
        if (!isRecent) continue;
        const htmlLen = Math.min(m.bodyHtml?.length ?? 0, MAX_HTML_PER_MESSAGE);
        const plainLen = Math.min(m.bodyPlain?.length ?? 0, MAX_PLAIN_PER_MESSAGE);
        if (htmlLen > 0 && remainingHtml >= htmlLen) {
          keepHtml[i] = true;
          remainingHtml -= htmlLen;
          // If HTML is kept, plain body is redundant for rendering.
          continue;
        }
        if (plainLen > 0 && remainingPlain >= plainLen) {
          keepPlain[i] = true;
          remainingPlain -= plainLen;
        }
      }

      const messages: GmailMessage[] = rawMessages.map((m, i) => {
        const clippedHtml = m.bodyHtml ? m.bodyHtml.slice(0, MAX_HTML_PER_MESSAGE) : undefined;
        const clippedPlain = m.bodyPlain ? m.bodyPlain.slice(0, MAX_PLAIN_PER_MESSAGE) : undefined;
        return {
          ...m,
          bodyHtml: keepHtml[i] ? clippedHtml : undefined,
          bodyPlain: keepHtml[i] ? undefined : (keepPlain[i] ? clippedPlain : undefined),
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

export function sendReply(accountId: string | undefined, threadId: string, rawMessage: string): Promise<{ id: string }> {
  const gmail = getGmailClient(accountId);
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

export function buildAndSendReply(accountId: string | undefined, threadId: string, bodyText: string): Promise<{ id: string }> {
  const gmail = getGmailClient(accountId);
  const db = getDb();
  if (!db) throw new Error('Database not initialized');
  const email = accountId && typeof accountId === 'string' ? accountId : getActiveAccountId(db);
  const fromEmail = email || '';

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
      const subject = getHeader(headers, 'Subject') || '';
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
      return sendReply(accountId, threadId, raw);
    });
}

export function modifyLabels(
  accountId: string | undefined,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const gmail = getGmailClient(accountId);
  return gmail.users.threads
    .modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds, removeLabelIds },
    })
    .then(() => undefined);
}

export function trashThread(accountId: string | undefined, threadId: string): Promise<void> {
  const gmail = getGmailClient(accountId);
  return gmail.users.threads.trash({ userId: 'me', id: threadId }).then(() => undefined);
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export function listLabels(accountId: string | undefined): Promise<GmailLabel[]> {
  const gmail = getGmailClient(accountId);
  return gmail.users.labels
    .list({ userId: 'me' })
    .then((res) =>
      (res.data.labels || []).map((l) => ({
        id: l.id!,
        name: l.name || l.id!,
        type: l.type || 'user',
      }))
    );
}

export async function searchThreads(
  accountId: string | undefined,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<ListThreadsResult> {
  const gmail = getGmailClient(accountId);
  const res = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults: Math.min(maxResults, 50),
    pageToken: pageToken || undefined,
  });
  const rawThreads = res.data.threads || [];
  const meta = await enrichThreads(gmail, rawThreads.map((t) => t.id!));
  const threads: ThreadSummary[] = rawThreads.map((t) => {
    const m = meta.get(t.id!);
    return {
      id: t.id!,
      snippet: m?.snippet || t.snippet || '',
      subject: m?.subject,
      from: m?.from,
      historyId: t.historyId ? String(t.historyId) : undefined,
    };
  });
  return { threads, nextPageToken: res.data.nextPageToken || undefined };
}

export function getLabelIds(): { INBOX: string; SENT: string; DRAFT: string } {
  return { INBOX: LABEL_INBOX, SENT: LABEL_SENT, DRAFT: LABEL_DRAFT };
}

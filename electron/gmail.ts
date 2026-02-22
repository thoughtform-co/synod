import { google } from 'googleapis';
import { getDb } from './db';
import { getSecret } from './secretStorage';
import { safeParse } from './safeJson';
import { withRetry } from './lib/apiClient';

const LABEL_INBOX = 'INBOX';
const LABEL_SENT = 'SENT';
const LABEL_DRAFT = 'DRAFT';

function getStoredJson(db: import('better-sqlite3').Database, key: string): unknown {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? safeParse(row.value, null) : null;
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
  const clientSecret = getSecret('google_client_secret');
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not stored');

  const row = db.prepare('SELECT tokens FROM accounts WHERE id = ?').get(email) as { tokens: string } | undefined;
  if (!row) throw new Error('No tokens for account');
  const tokens = safeParse(row.tokens, {} as { access_token?: string; refresh_token?: string; expiry_date?: number });
  if (!tokens.refresh_token) throw new Error('No tokens for account');

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
        // Format and metadataHeaders are valid but not in the minimal type
        gmail.users.threads.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
        } as { userId: string; id: string; format: string; metadataHeaders: string[] })
      )
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const data = r.value.data;
      if (!data.id) continue;
      const msgs = data.messages || [];
      const firstMsg = msgs[0];
      const rawH = firstMsg?.payload?.headers || [];
      const headers = rawH.map((h) => ({ name: (h as { name?: string | null; value?: string | null }).name ?? '', value: (h as { name?: string | null; value?: string | null }).value ?? '' }));
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

/** Thrown when startHistoryId is expired; caller should run full sync. */
export class HistoryIdExpiredError extends Error {
  constructor() {
    super('Gmail historyId expired');
    this.name = 'HistoryIdExpiredError';
  }
}

export interface HistoryRecord {
  id?: string;
  messages?: { id?: string; threadId?: string; labelIds?: string[] }[];
  messagesAdded?: { message?: { id?: string; threadId?: string; labelIds?: string[] } }[];
  messagesDeleted?: { message?: { id?: string; threadId?: string } }[];
  labelsAdded?: { message?: { id?: string; threadId?: string }; labelIds?: string[] }[];
  labelsRemoved?: { message?: { id?: string; threadId?: string }; labelIds?: string[] }[];
}

export interface FetchHistoryResult {
  historyId: string;
  history: HistoryRecord[];
  nextPageToken?: string;
}

/** Fetch history after startHistoryId. Throws HistoryIdExpiredError on 404. */
export async function fetchHistory(
  accountId: string | undefined,
  startHistoryId: string,
  maxResults?: number,
  pageToken?: string
): Promise<FetchHistoryResult> {
  const gmail = getGmailClient(accountId);
  try {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      maxResults: maxResults ?? 100,
      pageToken: pageToken || undefined,
    });
    const history = (res.data.history || []) as HistoryRecord[];
    const historyId = res.data.historyId ? String(res.data.historyId) : startHistoryId;
    return {
      historyId,
      history,
      nextPageToken: res.data.nextPageToken || undefined,
    };
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 404) throw new HistoryIdExpiredError();
    throw err;
  }
}

export async function listThreads(accountId: string | undefined, labelId: string, maxResults: number, pageToken?: string): Promise<ListThreadsResult> {
  return withRetry(async () => {
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
  });
}

export interface MessagePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: MessagePart[];
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
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
  internalDate?: number;
  bodyPlain?: string;
  bodyHtml?: string;
  attachments?: GmailAttachment[];
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

interface GmailPart {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string; attachmentId?: string; size?: number } | null;
  parts?: GmailPart[] | null;
}

function extractAttachments(part: GmailPart | undefined): GmailAttachment[] {
  const out: GmailAttachment[] = [];
  if (!part) return out;
  const attachmentId = part.body?.attachmentId;
  if (attachmentId) {
    const filename = part.filename?.trim() || 'attachment';
    out.push({
      filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body?.size ?? 0,
      attachmentId,
    });
  }
  if (part.parts) {
    for (const child of part.parts) {
      out.push(...extractAttachments(child));
    }
  }
  return out;
}

function extractBodies(part: GmailPart | undefined): { plain: string; html: string } {
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

export function getThread(accountId: string | undefined, threadId: string): Promise<{ id: string; snippet?: string; historyId?: string; messages: GmailMessage[] }> {
  return withRetry(() => {
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
        const { plain, html } = extractBodies(p as GmailPart);
        const attachments = extractAttachments(p as GmailPart);
        const internalDateRaw = (m as { internalDate?: string }).internalDate;
        const internalDate = internalDateRaw != null ? parseInt(String(internalDateRaw), 10) : undefined;
        return {
          id: m.id!,
          threadId: thread.id!,
          labelIds: m.labelIds || [],
          snippet: m.snippet || '',
          from: getHeader(headers, 'From') || undefined,
          to: getHeader(headers, 'To') || undefined,
          subject: getHeader(headers, 'Subject') || undefined,
          date: getHeader(headers, 'Date') || undefined,
          internalDate: Number.isFinite(internalDate) ? internalDate : undefined,
          bodyPlain: plain || undefined,
          bodyHtml: html || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
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
      return {
        id: thread.id!,
        snippet: thread.snippet ?? undefined,
        historyId: thread.historyId ? String(thread.historyId) : undefined,
        messages,
      };
    });
  });
}

/** Get attachment data (base64url-encoded) for a message attachment. */
export function getAttachment(
  accountId: string | undefined,
  messageId: string,
  attachmentId: string
): Promise<{ data: string }> {
  return withRetry(() => {
    const gmail = getGmailClient(accountId);
    return gmail.users.messages.attachments
      .get({
        userId: 'me',
        messageId,
        id: attachmentId,
      })
      .then((res) => ({ data: res.data.data ?? '' }));
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
  return withRetry(() => {
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
  });
}

export function modifyLabels(
  accountId: string | undefined,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  return withRetry(() => {
    const gmail = getGmailClient(accountId);
    return gmail.users.threads
      .modify({
        userId: 'me',
        id: threadId,
        requestBody: { addLabelIds, removeLabelIds },
      })
      .then(() => undefined);
  });
}

export function trashThread(accountId: string | undefined, threadId: string): Promise<void> {
  return withRetry(() => {
    const gmail = getGmailClient(accountId);
    return gmail.users.threads.trash({ userId: 'me', id: threadId }).then(() => undefined);
  });
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export function listLabels(accountId: string | undefined): Promise<GmailLabel[]> {
  return withRetry(() => {
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
  });
}

export async function searchThreads(
  accountId: string | undefined,
  query: string,
  maxResults: number,
  pageToken?: string
): Promise<ListThreadsResult> {
  return withRetry(async () => {
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
  });
}

export function getLabelIds(): { INBOX: string; SENT: string; DRAFT: string } {
  return { INBOX: LABEL_INBOX, SENT: LABEL_SENT, DRAFT: LABEL_DRAFT };
}

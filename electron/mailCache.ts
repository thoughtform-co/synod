import { getDb } from './db';

export interface CachedThreadSummary {
  id: string;
  snippet: string;
  subject?: string;
  from?: string;
  historyId?: string;
}

export interface CachedMessage {
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
}

/** Read thread list for a label from SQLite. Returns empty array if none. */
export function getThreadListFromDb(
  accountId: string,
  labelId: string,
  maxResults: number
): CachedThreadSummary[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT t.thread_id, t.snippet, t.subject, t.from_name, t.history_id
       FROM threads t
       INNER JOIN thread_labels tl ON t.account_id = tl.account_id AND t.thread_id = tl.thread_id
       WHERE t.account_id = ? AND tl.label_id = ?
       ORDER BY t.updated_at DESC
       LIMIT ?`
    )
    .all(accountId, labelId, maxResults) as { thread_id: string; snippet: string; subject: string | null; from_name: string | null; history_id: string | null }[];
  return rows.map((r) => ({
    id: r.thread_id,
    snippet: r.snippet ?? '',
    subject: r.subject ?? undefined,
    from: r.from_name ?? undefined,
    historyId: r.history_id ?? undefined,
  }));
}

/** Read one thread with messages from SQLite. Returns null if not found. */
export function getThreadFromDb(
  accountId: string,
  threadId: string
): { id: string; messages: CachedMessage[] } | null {
  const db = getDb();
  if (!db) return null;
  const threadRow = db
    .prepare('SELECT thread_id FROM threads WHERE account_id = ? AND thread_id = ?')
    .get(accountId, threadId) as { thread_id: string } | undefined;
  if (!threadRow) return null;
  const msgRows = db
    .prepare(
      'SELECT message_id, thread_id, from_addr, to_addr, subject, date, snippet, body_plain, body_html, label_ids FROM messages WHERE account_id = ? AND thread_id = ? ORDER BY date ASC'
    )
    .all(accountId, threadId) as {
      message_id: string;
      thread_id: string;
      from_addr: string | null;
      to_addr: string | null;
      subject: string | null;
      date: string | null;
      snippet: string | null;
      body_plain: string | null;
      body_html: string | null;
      label_ids: string | null;
    }[];
  const messages: CachedMessage[] = msgRows.map((r) => {
    let labelIds: string[] = [];
    if (r.label_ids) {
      try {
        labelIds = JSON.parse(r.label_ids) as string[];
      } catch { /* ignore */ }
    }
    return {
      id: r.message_id,
      threadId: r.thread_id,
      labelIds,
      snippet: r.snippet ?? '',
      from: r.from_addr ?? undefined,
      to: r.to_addr ?? undefined,
      subject: r.subject ?? undefined,
      date: r.date ?? undefined,
      bodyPlain: r.body_plain ?? undefined,
      bodyHtml: r.body_html ?? undefined,
    };
  });
  return { id: threadId, messages };
}

import { getDb } from './db';
import {
  listThreads,
  getThread,
  fetchHistory,
  HistoryIdExpiredError,
  type ThreadSummary,
  type HistoryRecord,
  type GmailMessage,
} from './gmail';

const SYNC_KIND_GMAIL = 'gmail';
const INITIAL_SYNC_THREAD_CAP = 200;
const POLL_INTERVAL_MS = 60_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let syncStatusCallback: ((status: SyncStatus) => void) | null = null;

export type SyncStatus = 'idle' | 'syncing' | 'up-to-date' | 'error';

export function onSyncStatus(cb: (status: SyncStatus) => void): void {
  syncStatusCallback = cb;
}

function emitStatus(status: SyncStatus): void {
  syncStatusCallback?.(status);
}

function getAccountIds(): string[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare('SELECT id FROM accounts').all() as { id: string }[];
  return rows.map((r) => r.id);
}

function getSyncCursor(accountId: string): string | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT cursor FROM sync_state WHERE account_id = ? AND kind = ?').get(accountId, SYNC_KIND_GMAIL) as { cursor: string | null } | undefined;
  return row?.cursor ?? null;
}

function setSyncCursor(accountId: string, historyId: string): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  db.prepare(
    'INSERT OR REPLACE INTO sync_state (account_id, kind, cursor, updated_at) VALUES (?, ?, ?, ?)'
  ).run(accountId, SYNC_KIND_GMAIL, historyId, now);
}

/** Persist thread list from API (e.g. listThreads result). Exported for IPC write-through. */
export function persistThreads(accountId: string, threads: ThreadSummary[], labelId: string): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  const insertThread = db.prepare(`
    INSERT INTO threads (account_id, thread_id, snippet, subject, from_name, history_id, label_ids, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, thread_id) DO UPDATE SET
      snippet = excluded.snippet,
      subject = excluded.subject,
      from_name = excluded.from_name,
      history_id = excluded.history_id,
      label_ids = excluded.label_ids,
      updated_at = excluded.updated_at
  `);
  const insertLabel = db.prepare(`
    INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES (?, ?, ?)
  `);
  const labelIdsJson = JSON.stringify([labelId]);
  for (const t of threads) {
    insertThread.run(
      accountId,
      t.id,
      t.snippet ?? '',
      t.subject ?? null,
      t.from ?? null,
      t.historyId ?? null,
      labelIdsJson,
      now
    );
    insertLabel.run(accountId, t.id, labelId);
  }
}

/** Persist a full thread and its messages (e.g. from getThread). */
function persistThreadWithMessages(
  accountId: string,
  threadId: string,
  snippet: string | undefined,
  historyId: string | null,
  messages: GmailMessage[]
): void {
  const db = getDb();
  if (!db) return;
  const now = Date.now();
  const first = messages[0];
  const subject = first?.subject ?? null;
  const fromName = first?.from ?? null;
  const allLabelIds = new Set<string>();
  for (const m of messages) {
    (m.labelIds ?? []).forEach((id) => allLabelIds.add(id));
  }
  const labelIdsJson = JSON.stringify([...allLabelIds]);
  db.prepare(`
    INSERT INTO threads (account_id, thread_id, snippet, subject, from_name, history_id, label_ids, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, thread_id) DO UPDATE SET
      snippet = excluded.snippet,
      subject = excluded.subject,
      from_name = excluded.from_name,
      history_id = COALESCE(excluded.history_id, threads.history_id),
      label_ids = excluded.label_ids,
      updated_at = excluded.updated_at
  `).run(accountId, threadId, snippet ?? '', subject, fromName, historyId, labelIdsJson, now);
  const insertMsg = db.prepare(`
    INSERT INTO messages (account_id, message_id, thread_id, from_addr, to_addr, subject, date, internal_date, snippet, body_plain, body_html, label_ids, attachments, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, message_id) DO UPDATE SET
      thread_id = excluded.thread_id,
      from_addr = excluded.from_addr,
      to_addr = excluded.to_addr,
      subject = excluded.subject,
      date = excluded.date,
      internal_date = excluded.internal_date,
      snippet = excluded.snippet,
      body_plain = excluded.body_plain,
      body_html = excluded.body_html,
      label_ids = excluded.label_ids,
      attachments = excluded.attachments,
      updated_at = excluded.updated_at
  `);
  for (const m of messages) {
    insertMsg.run(
      accountId,
      m.id,
      threadId,
      m.from ?? null,
      m.to ?? null,
      m.subject ?? null,
      m.date ?? null,
      m.internalDate ?? null,
      m.snippet ?? null,
      m.bodyPlain ?? null,
      m.bodyHtml ?? null,
      JSON.stringify(m.labelIds ?? []),
      m.attachments && m.attachments.length > 0 ? JSON.stringify(m.attachments) : null,
      now
    );
  }
  db.prepare('DELETE FROM thread_labels WHERE account_id = ? AND thread_id = ?').run(accountId, threadId);
  const insertLabel = db.prepare(
    'INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES (?, ?, ?)'
  );
  for (const lid of allLabelIds) {
    insertLabel.run(accountId, threadId, lid);
  }
}

/** Persist full thread from getThread result. Exported for IPC write-through. */
export function persistThreadFromApi(
  accountId: string,
  threadData: { id: string; snippet?: string; historyId?: string; messages: GmailMessage[] }
): void {
  persistThreadWithMessages(
    accountId,
    threadData.id,
    threadData.snippet,
    threadData.historyId ?? null,
    threadData.messages
  );
}

/** Process one history record: apply messagesAdded, messagesDeleted, labelsAdded, labelsRemoved to SQLite. */
async function processHistoryRecord(accountId: string, record: HistoryRecord): Promise<void> {
  const db = getDb();
  if (!db) return;
  const threadIdsToRefresh = new Set<string>();
  const messageIdsToDelete: string[] = [];
  const messageLabelUpdates: { messageId: string; threadId: string; labelIds: string[] }[] = [];

  if (record.messagesAdded?.length) {
    for (const entry of record.messagesAdded) {
      const msg = entry.message;
      if (msg?.threadId) threadIdsToRefresh.add(msg.threadId);
    }
  }
  if (record.messagesDeleted?.length) {
    for (const entry of record.messagesDeleted) {
      const msg = entry.message;
      if (msg?.id) messageIdsToDelete.push(msg.id);
    }
  }
  if (record.labelsAdded?.length || record.labelsRemoved?.length) {
    const byMessage = new Map<string, { threadId: string; labelIds: Set<string> }>();
    for (const entry of record.labelsAdded ?? []) {
      const msg = entry.message;
      if (!msg?.id || !msg.threadId) continue;
      let state = byMessage.get(msg.id);
      if (!state) {
        const row = db.prepare('SELECT label_ids FROM messages WHERE account_id = ? AND message_id = ?').get(accountId, msg.id) as { label_ids: string } | undefined;
        const current = row?.label_ids ? (JSON.parse(row.label_ids) as string[]) : [];
        state = { threadId: msg.threadId, labelIds: new Set(current) };
        byMessage.set(msg.id, state);
      }
      (entry.labelIds ?? []).forEach((id) => state!.labelIds.add(id));
    }
    for (const entry of record.labelsRemoved ?? []) {
      const msg = entry.message;
      if (!msg?.id || !msg.threadId) continue;
      let state = byMessage.get(msg.id);
      if (!state) {
        const row = db.prepare('SELECT label_ids FROM messages WHERE account_id = ? AND message_id = ?').get(accountId, msg.id) as { label_ids: string } | undefined;
        const current = row?.label_ids ? (JSON.parse(row.label_ids) as string[]) : [];
        state = { threadId: msg.threadId, labelIds: new Set(current) };
        byMessage.set(msg.id, state);
      }
      (entry.labelIds ?? []).forEach((id) => state!.labelIds.delete(id));
    }
    for (const [messageId, { threadId, labelIds }] of byMessage) {
      messageLabelUpdates.push({ messageId, threadId, labelIds: [...labelIds] });
    }
  }

  for (const mid of messageIdsToDelete) {
    const row = db.prepare('SELECT thread_id FROM messages WHERE account_id = ? AND message_id = ?').get(accountId, mid) as { thread_id: string } | undefined;
    db.prepare('DELETE FROM messages WHERE account_id = ? AND message_id = ?').run(accountId, mid);
    if (row) {
      const count = db.prepare('SELECT 1 FROM messages WHERE account_id = ? AND thread_id = ?').all(accountId, row.thread_id).length;
      if (count === 0) {
        db.prepare('DELETE FROM thread_labels WHERE account_id = ? AND thread_id = ?').run(accountId, row.thread_id);
        db.prepare('DELETE FROM threads WHERE account_id = ? AND thread_id = ?').run(accountId, row.thread_id);
      }
    }
  }

  for (const { messageId, threadId, labelIds } of messageLabelUpdates) {
    db.prepare('UPDATE messages SET label_ids = ?, updated_at = ? WHERE account_id = ? AND message_id = ?').run(JSON.stringify(labelIds), Date.now(), accountId, messageId);
    const threads = db.prepare('SELECT thread_id FROM threads WHERE account_id = ? AND thread_id = ?').all(accountId, threadId);
    if (threads.length > 0) {
      const msgRows = db.prepare('SELECT label_ids FROM messages WHERE account_id = ? AND thread_id = ?').all(accountId, threadId) as { label_ids: string }[];
      const union = new Set<string>();
      for (const r of msgRows) {
        try {
          (JSON.parse(r.label_ids) as string[]).forEach((id) => union.add(id));
        } catch { /* ignore */ }
      }
      db.prepare('UPDATE threads SET label_ids = ?, updated_at = ? WHERE account_id = ? AND thread_id = ?').run(JSON.stringify([...union]), Date.now(), accountId, threadId);
      db.prepare('DELETE FROM thread_labels WHERE account_id = ? AND thread_id = ?').run(accountId, threadId);
      const insertLabel = db.prepare('INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES (?, ?, ?)');
      for (const lid of union) insertLabel.run(accountId, threadId, lid);
    }
  }

  for (const threadId of threadIdsToRefresh) {
    try {
      const threadData = await getThread(accountId, threadId);
      persistThreadWithMessages(
        accountId,
        threadData.id,
        threadData.snippet,
        threadData.historyId ?? null,
        threadData.messages
      );
    } catch (e) {
      console.error('[syncEngine] getThread failed for', threadId, e);
    }
  }
}

/** Run full sync for one account: threads.list INBOX, persist threads + thread_labels, set historyId cursor. */
export async function runFullSyncForAccount(accountId: string): Promise<void> {
  const result = await listThreads(accountId, 'INBOX', INITIAL_SYNC_THREAD_CAP);
  const { threads } = result;
  if (threads.length === 0) return;
  persistThreads(accountId, threads, 'INBOX');
  let maxHistoryId: string | null = null;
  for (const t of threads) {
    if (t.historyId) {
      if (!maxHistoryId || String(t.historyId) > maxHistoryId) maxHistoryId = String(t.historyId);
    }
  }
  if (maxHistoryId) setSyncCursor(accountId, maxHistoryId);
}

/** Run full sync for all accounts that have no cursor; then emit up-to-date. */
export async function runInitialSync(): Promise<void> {
  emitStatus('syncing');
  const accountIds = getAccountIds();
  let hadError = false;
  for (const accountId of accountIds) {
    const cursor = getSyncCursor(accountId);
    if (cursor != null) continue;
    try {
      await runFullSyncForAccount(accountId);
    } catch (e) {
      console.error('[syncEngine] full sync failed for', accountId, e);
      hadError = true;
    }
  }
  emitStatus(hadError ? 'error' : 'up-to-date');
}

/** Start the sync engine: run initial sync then poll every 60s (incremental added later). */
export function startSyncEngine(): void {
  runInitialSync().catch((e) => {
    console.error('[syncEngine] initial sync failed', e);
    emitStatus('error');
  });
  pollTimer = setInterval(() => {
    runIncrementalSync().catch((e) => {
      console.error('[syncEngine] incremental sync failed', e);
      emitStatus('error');
    });
  }, POLL_INTERVAL_MS);
}

/** Stop the sync engine (e.g. on app quit). */
export function stopSyncEngine(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  syncStatusCallback = null;
}

/** Incremental sync: history.list per account, apply deltas; on 404 run full sync. */
export async function runIncrementalSync(): Promise<void> {
  emitStatus('syncing');
  const accountIds = getAccountIds();
  let hadError = false;
  for (const accountId of accountIds) {
    const cursor = getSyncCursor(accountId);
    if (cursor == null) {
      try {
        await runFullSyncForAccount(accountId);
      } catch (e) {
        console.error('[syncEngine] full sync failed for', accountId, e);
        hadError = true;
      }
      continue;
    }
    try {
      let nextPageToken: string | undefined;
      let latestHistoryId = cursor;
      do {
        const result = await fetchHistory(accountId, cursor, 100, nextPageToken);
        latestHistoryId = result.historyId;
        for (const record of result.history) {
          await processHistoryRecord(accountId, record);
        }
        nextPageToken = result.nextPageToken;
      } while (nextPageToken);
      setSyncCursor(accountId, latestHistoryId);
    } catch (e) {
      if (e instanceof HistoryIdExpiredError) {
        try {
          await runFullSyncForAccount(accountId);
        } catch (fullErr) {
          console.error('[syncEngine] full sync after 404 failed for', accountId, fullErr);
          hadError = true;
        }
      } else {
        console.error('[syncEngine] incremental sync failed for', accountId, e);
        hadError = true;
      }
    }
  }
  emitStatus(hadError ? 'error' : 'up-to-date');
}

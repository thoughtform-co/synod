import { useEffect, useState } from 'react';
interface InviteThread {
  id: string;
  subject?: string;
  from?: string;
  snippet?: string;
  internalDate?: number;
}

interface PendingInvitesFeedProps {
  accountIds: string[];
  onSelectThread: (threadId: string) => void;
}

export function PendingInvitesFeed({ accountIds, onSelectThread }: PendingInvitesFeedProps) {
  const [threads, setThreads] = useState<InviteThread[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.gmail;
    if (!api?.searchThreads || accountIds.length === 0) {
      setThreads([]);
      return;
    }
    setLoading(true);
    const query = 'has:invite is:unread';
    Promise.all(
      accountIds.map((accountId) =>
        api.searchThreads(accountId, query, 10).then((r) => ({ accountId, threads: r.threads }))
      )
    )
      .then((results) => {
        const seen = new Set<string>();
        const merged: InviteThread[] = [];
        for (const { threads: list } of results) {
          for (const t of list) {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              merged.push({
                id: t.id,
                subject: t.subject,
                from: t.from,
                snippet: t.snippet,
                internalDate: t.internalDate,
              });
            }
          }
        }
        merged.sort((a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0));
        setThreads(merged.slice(0, 10));
      })
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [accountIds.join(',')]);

  if (threads.length === 0 && !loading) return null;

  return (
    <div className="synod-cal__pending">
      <div className="synod-cal__pending-header">PENDING</div>
      {loading ? (
        <div className="synod-cal__pending-loading">…</div>
      ) : (
        <ul className="synod-cal__pending-list">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="synod-cal__pending-item"
                onClick={() => onSelectThread(t.id)}
              >
                <span className="synod-cal__pending-subject" title={t.subject}>
                  {t.subject ? (t.subject.length > 36 ? t.subject.slice(0, 36) + '…' : t.subject) : '(No subject)'}
                </span>
                {t.from && (
                  <span className="synod-cal__pending-from">
                    {t.from.includes('<') ? t.from.split('<')[0].trim() : t.from}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

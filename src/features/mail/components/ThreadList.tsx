import { useEffect, useState } from 'react';
import { fetchInboxThreads, type ThreadSummary } from '../mailRepository';

interface ThreadListProps {
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
}

export function ThreadList({ selectedThreadId, onSelectThread }: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchInboxThreads(30)
      .then(({ threads: list }) => {
        if (!cancelled) setThreads(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="thread-list">
        <div className="thread-list__error">{error}</div>
      </div>
    );
  }

  return (
    <div className="thread-list">
      <header className="thread-list__header">
        <h2 className="thread-list__title">Inbox</h2>
      </header>
      {loading ? (
        <div className="thread-list__loading">Loading…</div>
      ) : (
        <ul className="thread-list__items">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`thread-list__item ${selectedThreadId === t.id ? 'thread-list__item--selected' : ''}`}
                onClick={() => onSelectThread(t.id)}
              >
                <span className="thread-list__from">—</span>
                <span className="thread-list__subject">{t.snippet || '(No subject)'}</span>
                <span className="thread-list__snippet" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

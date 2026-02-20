import { useEffect, useState } from 'react';
import { fetchThreadsByView, type ThreadSummary, type MailView } from '../mailRepository';

const VIEW_TITLES: Record<string, string> = {
  INBOX: 'Inbox',
  invites: 'Invites',
  SENT: 'Sent',
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_UPDATES: 'Updates',
  SPAM: 'Spam',
};

function viewTitle(view: MailView): string {
  if (view.type === 'label') return VIEW_TITLES[view.labelId] ?? view.labelId;
  return 'Invites';
}

interface ThreadListProps {
  activeAccountId: string | null;
  mailView: MailView;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
}

const PAGE_SIZE = 30;

export function ThreadList({ activeAccountId, mailView, selectedThreadId, onSelectThread }: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeAccountId === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNextPageToken(undefined);
    fetchThreadsByView(activeAccountId ?? undefined, mailView, PAGE_SIZE)
      .then(({ threads: list, nextPageToken: token }) => {
        if (!cancelled) {
          setThreads(list);
          setNextPageToken(token);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeAccountId, mailView.type, mailView.type === 'label' ? mailView.labelId : mailView.query]);

  const loadMore = () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    fetchThreadsByView(activeAccountId ?? undefined, mailView, PAGE_SIZE, nextPageToken)
      .then(({ threads: list, nextPageToken: token }) => {
        setThreads((prev) => [...prev, ...list]);
        setNextPageToken(token);
      })
      .finally(() => setLoadingMore(false));
  };

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
        <h2 className="thread-list__title">{viewTitle(mailView)}</h2>
      </header>
      {loading ? (
        <div className="thread-list__loading">Loading…</div>
      ) : (
        <>
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
          {nextPageToken && (
            <div className="thread-list__load-more">
              <button
                type="button"
                className="thread-list__load-more-btn"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

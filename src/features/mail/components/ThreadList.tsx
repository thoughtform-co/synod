import { useEffect, useRef, useState } from 'react';
import { ParticleNavIcon } from '@/components/shared/ParticleNavIcon';
import { fetchThreadsByView, type ThreadSummary, type MailView } from '../mailRepository';
import { useSyncStatus } from '../useSyncStatus';

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
  /** Thread IDs just mutated (done/delete); omit from list so they disappear immediately. */
  removedThreadIds?: string[];
}

const PAGE_SIZE = 30;

export function ThreadList({ activeAccountId, mailView, selectedThreadId, onSelectThread, removedThreadIds = [] }: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncStatus = useSyncStatus();
  const prevSyncStatus = useRef(syncStatus);

  const removedSet = removedThreadIds.length > 0 ? new Set(removedThreadIds) : null;
  const visibleThreads = removedSet ? threads.filter((t) => !removedSet.has(t.id)) : threads;

  useEffect(() => {
    if (activeAccountId === undefined) return;
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError(null);
    setNextPageToken(undefined);
    fetchThreadsByView(activeAccountId ?? undefined, mailView, PAGE_SIZE)
      .then(({ threads: list, nextPageToken: token }) => {
        if (signal.aborted) return;
        setThreads(list);
        setNextPageToken(token);
      })
      .catch((e) => {
        if (!signal.aborted) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeAccountId, mailView.type, mailView.type === 'label' ? mailView.labelId : mailView.query]);

  // Refetch list when sync becomes up-to-date so UI shows background updates.
  useEffect(() => {
    if (prevSyncStatus.current !== 'up-to-date' && syncStatus === 'up-to-date' && activeAccountId !== undefined) {
      fetchThreadsByView(activeAccountId ?? undefined, mailView, PAGE_SIZE).then(({ threads: list, nextPageToken: token }) => {
        setThreads(list);
        setNextPageToken(token);
      });
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, activeAccountId, mailView]);

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
        <span
          className={`thread-list__sync-icon ${syncStatus === 'syncing' ? 'thread-list__sync-icon--spinning' : ''}`}
          title={syncStatus === 'syncing' ? 'Syncing…' : 'Synced'}
          aria-live="polite"
          aria-label={syncStatus === 'syncing' ? 'Syncing' : 'Synced'}
        >
          <ParticleNavIcon shape="sync" size={14} active={syncStatus === 'syncing'} />
        </span>
      </header>
      {loading ? (
        <div className="thread-list__loading">Loading…</div>
      ) : (
        <>
          <ul className="thread-list__items">
            {visibleThreads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`thread-list__item ${selectedThreadId === t.id ? 'thread-list__item--selected' : ''}`}
                  onClick={() => onSelectThread(t.id)}
                >
                  <span className="thread-list__from">{t.from || '—'}</span>
                  <span className="thread-list__subject">{t.subject || '(No subject)'}</span>
                  <span className="thread-list__snippet">{t.snippet || ''}</span>
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

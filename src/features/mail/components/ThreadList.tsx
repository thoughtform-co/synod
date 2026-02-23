import { useEffect, useRef, useState, useCallback } from 'react';
import { ParticleNavIcon } from '@/components/shared/ParticleNavIcon';
import type { LocalSearchResult } from '@/vite-env';
import { fetchThreadsByView, type ThreadSummary, type MailView } from '../mailRepository';
import { formatThreadListDate, getDateSection } from '../utils';
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

const INBOX_CATEGORY_LABELS: { id: string; name: string }[] = [
  { id: 'INBOX', name: 'Inbox' },
  { id: 'CATEGORY_PROMOTIONS', name: 'Promotions' },
  { id: 'CATEGORY_SOCIAL', name: 'Social' },
  { id: 'CATEGORY_UPDATES', name: 'Updates' },
];

interface ThreadListProps {
  activeAccountId: string | null;
  /** Current user email for unreplied detection (last message not from this user). */
  currentUserEmail?: string | null;
  mailView: MailView;
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  /** When provided, show category tabs when viewing Inbox (or a category). */
  onViewChange?: (view: MailView) => void;
  /** Thread IDs just mutated (done/delete); omit from list so they disappear immediately. */
  removedThreadIds?: string[];
  /** Thread ID currently playing the done-glitch animation. */
  glitchThreadId?: string | null;
  /** When set, show these filtered results instead of the normal thread list. */
  searchResults?: LocalSearchResult[];
  /** Ref updated with the current visible thread IDs for external consumers. */
  threadIdsRef?: React.MutableRefObject<string[]>;
}

const PAGE_SIZE = 30;

export function ThreadList({ activeAccountId, currentUserEmail, mailView, selectedThreadId, onSelectThread, onViewChange, removedThreadIds = [], glitchThreadId = null, searchResults = [], threadIdsRef }: ThreadListProps) {
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

  // Refetch when stale cache entries are backfilled in the background.
  useEffect(() => {
    const unsub = window.electronAPI?.sync?.onThreadsRefreshed?.(() => {
      if (activeAccountId !== undefined) {
        fetchThreadsByView(activeAccountId ?? undefined, mailView, PAGE_SIZE).then(({ threads: list, nextPageToken: token }) => {
          setThreads(list);
          setNextPageToken(token);
        });
      }
    });
    return unsub;
  }, [activeAccountId, mailView]);

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

  const isSearchActive = searchResults.length > 0;
  const items = isSearchActive
    ? searchResults.map((r) => ({ threadId: r.threadId, from: r.from, subject: r.subject, snippet: r.snippet, internalDate: r.internalDate, fromEmail: undefined as string | undefined }))
    : visibleThreads.map((t) => ({ threadId: t.id, from: t.from, subject: t.subject, snippet: t.snippet, internalDate: t.internalDate, fromEmail: t.fromEmail }));

  const itemIds = items.map((i) => i.threadId);
  if (threadIdsRef) threadIdsRef.current = itemIds;

  const showCategoryTabs =
    !isSearchActive &&
    onViewChange &&
    mailView.type === 'label' &&
    INBOX_CATEGORY_LABELS.some((c) => c.id === mailView.labelId);

  return (
    <div className="thread-list">
      {!isSearchActive && (
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
      )}
      {showCategoryTabs && (
        <div className="thread-list__category-tabs">
          {INBOX_CATEGORY_LABELS.map((tab) => {
            const isActive = mailView.type === 'label' && mailView.labelId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`thread-list__category-tab ${isActive ? 'thread-list__category-tab--active' : ''}`}
                onClick={() => onViewChange!({ type: 'label', labelId: tab.id })}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      )}
      {loading && !isSearchActive ? (
        <div className="thread-list__loading">Loading…</div>
      ) : (
        <>
          <ul className="thread-list__items">
            {items.map((item, i) => {
              const section = getDateSection(item.internalDate);
              const prevSection = i > 0 ? getDateSection(items[i - 1].internalDate) : null;
              const showHeader = section && section !== prevSection;
              return (
                <li key={item.threadId}>
                  {showHeader && (
                    <div className="thread-list__section-header">{section}</div>
                  )}
                  <button
                    type="button"
                    className={`thread-list__item ${selectedThreadId === item.threadId ? 'thread-list__item--selected' : ''} ${glitchThreadId === item.threadId ? 'thread-list__item--done-glitch' : ''} ${currentUserEmail && item.fromEmail && item.fromEmail.toLowerCase() !== currentUserEmail.toLowerCase() ? 'thread-list__item--unreplied' : ''}`}
                    onClick={() => onSelectThread(item.threadId)}
                  >
                    <div className="thread-list__row thread-list__row--meta">
                      <span className="thread-list__from">{item.from || '—'}</span>
                      <span className="thread-list__date">{formatThreadListDate(item.internalDate)}</span>
                    </div>
                    <span className="thread-list__subject">{item.subject || '(No subject)'}</span>
                    <span className="thread-list__snippet">{item.snippet || ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!isSearchActive && nextPageToken && (
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

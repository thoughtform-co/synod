import { useEffect, useState, useCallback, useRef } from 'react';
import { Check, ChevronRight, Clock, ListTodo, Trash2 } from 'lucide-react';
import { fetchThread, doneThread, deleteThread, type ThreadDetail } from '../mailRepository';
import { formatEmailDate } from '../utils';
import { ReplyComposer } from './ReplyComposer';

interface ThreadViewProps {
  threadId: string;
  activeAccountId: string | null;
  currentUserEmail?: string | null;
  onDone?: (threadId: string) => void;
  onDelete?: (threadId: string) => void;
}

function isFocusInEditable(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  return false;
}

function isFromCurrentUser(from: string, currentUserEmail: string | null | undefined): boolean {
  if (!currentUserEmail) return false;
  const email = currentUserEmail.toLowerCase();
  return from.toLowerCase().includes(email);
}

export function ThreadView({ threadId, activeAccountId, currentUserEmail, onDone, onDelete }: ThreadViewProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (activeAccountId === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchThread(activeAccountId ?? undefined, threadId)
      .then((t) => {
        if (!cancelled) {
          setThread(t);
          if (t && t.messages.length > 0) {
            setExpandedIds(new Set([t.messages[t.messages.length - 1].id]));
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load thread');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeAccountId, threadId]);

  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const pendingScrollRef = useRef<string | null>(null);

  const toggleMessage = useCallback((msgId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
        pendingScrollRef.current = msgId;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    requestAnimationFrame(() => {
      const el = msgRefs.current.get(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [expandedIds]);

  const expandAll = useCallback(() => {
    if (!thread) return;
    setExpandedIds(new Set(thread.messages.map((m) => m.id)));
  }, [thread]);

  const handleSendReply = useCallback(async (bodyText: string) => {
    if (!thread) return;
    setSending(true);
    try {
      const { sendReply } = await import('../mailRepository');
      await sendReply(activeAccountId ?? undefined, thread.id, bodyText);
      const updated = await fetchThread(activeAccountId ?? undefined, threadId);
      setThread(updated ?? thread);
    } finally {
      setSending(false);
    }
  }, [activeAccountId, thread, threadId]);

  const handleDone = useCallback(async () => {
    if (!thread || actionPending) return;
    setActionPending(true);
    try {
      await doneThread(activeAccountId ?? undefined, thread.id);
      onDone?.(thread.id);
    } finally {
      setActionPending(false);
    }
  }, [activeAccountId, thread, actionPending, onDone]);

  const handleDelete = useCallback(async () => {
    if (!thread || actionPending) return;
    if (!window.confirm('Move this conversation to Trash?')) return;
    setActionPending(true);
    try {
      await deleteThread(activeAccountId ?? undefined, thread.id);
      onDelete?.(thread.id);
    } finally {
      setActionPending(false);
    }
  }, [activeAccountId, thread, actionPending, onDelete]);

  const focusReply = useCallback(() => {
    replyComposerRef.current?.focus();
  }, []);

  const handleReplyAll = useCallback(() => {
    focusReply();
  }, [focusReply]);

  const handleReminder = useCallback(() => {
    // Stub: local reminder (Phase 4)
  }, []);

  const handleTask = useCallback(() => {
    // Stub: Todoist (Phase 4)
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFocusInEditable()) return;
      const key = e.key.toUpperCase();
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (key) {
        case 'E':
          e.preventDefault();
          handleDone();
          break;
        case 'R':
          e.preventDefault();
          focusReply();
          break;
        case 'A':
          e.preventDefault();
          handleReplyAll();
          break;
        case 'T':
          e.preventDefault();
          handleReminder();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDone, focusReply, handleReplyAll, handleReminder]);

  if (error) {
    return (
      <div className="thread-view">
        <p className="thread-view__error">{error}</p>
      </div>
    );
  }

  if (loading || !thread) {
    return (
      <div className="thread-view">
        <p className="thread-view__loading">Loading thread…</p>
      </div>
    );
  }

  const subject = thread.messages[0]?.subject ?? '(No subject)';

  return (
    <div className="thread-view">
      <header className="thread-view__header">
        <div className="thread-view__header-row">
          <h1 className="thread-view__subject">{subject}</h1>
          <div className="thread-view__actions">
            <button
              type="button"
              className="thread-view__action-btn"
              onClick={handleDone}
              disabled={actionPending}
              title="Done (E)"
              aria-label="Done"
            >
              <Check size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="thread-view__action-btn"
              onClick={handleReminder}
              title="Reminder (T)"
              aria-label="Reminder"
            >
              <Clock size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="thread-view__action-btn"
              onClick={handleTask}
              title="Add to Task"
              aria-label="Add to tasks"
            >
              <ListTodo size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="thread-view__action-btn"
              onClick={handleDelete}
              disabled={actionPending}
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>
      <div className="thread-view__messages">
        <ReplyComposer
          ref={replyComposerRef}
          onSend={handleSendReply}
          disabled={sending}
          fromEmail={currentUserEmail ?? undefined}
          toLabel={thread.messages[thread.messages.length - 1]?.from}
        />
        {thread.messages.length > 2 && expandedIds.size < thread.messages.length && (
          <button
            type="button"
            className="thread-view__expand-all"
            onClick={expandAll}
          >
            {thread.messages.length - expandedIds.size} collapsed message{thread.messages.length - expandedIds.size !== 1 ? 's' : ''}
          </button>
        )}
        {[...thread.messages].reverse().map((msg) => {
          const isExpanded = expandedIds.has(msg.id);
          const snippet = (msg.bodyPlain || msg.snippet || '').slice(0, 120).replace(/\n/g, ' ');
          const fromMe = isFromCurrentUser(msg.from, currentUserEmail ?? null);
          return (
            <div
              key={msg.id}
              ref={(el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
              className={`thread-view__message ${isExpanded ? 'thread-view__message--expanded' : 'thread-view__message--collapsed'} ${fromMe ? 'thread-view__message--from-me' : ''}`}
            >
              <button
                type="button"
                className="thread-view__message-header"
                onClick={() => toggleMessage(msg.id)}
                aria-expanded={isExpanded}
              >
                <ChevronRight
                  size={14}
                  strokeWidth={1.5}
                  className={`thread-view__message-chevron ${isExpanded ? 'thread-view__message-chevron--open' : ''}`}
                />
                <span className="thread-view__message-from">{msg.from}</span>
                {!isExpanded && (
                  <span className="thread-view__message-snippet">{snippet || '(No content)'}</span>
                )}
                <span className="thread-view__message-date">{formatEmailDate(msg.date)}</span>
              </button>
              {isExpanded && (
                <div
                  className={`thread-view__message-body ${msg.bodyHtml ? 'thread-view__message-body--html' : ''}`}
                  {...(msg.bodyHtml
                    ? { dangerouslySetInnerHTML: { __html: msg.bodyHtml } }
                    : { children: msg.bodyPlain })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

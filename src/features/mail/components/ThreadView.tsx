import { useEffect, useState, useCallback, useRef } from 'react';
import { Check, Clock, ListTodo, Trash2 } from 'lucide-react';
import { fetchThread, doneThread, deleteThread, type ThreadDetail } from '../mailRepository';
import { ReplyComposer } from './ReplyComposer';

interface ThreadViewProps {
  threadId: string;
  activeAccountId: string | null;
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

export function ThreadView({ threadId, activeAccountId, onDone, onDelete }: ThreadViewProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (activeAccountId === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchThread(activeAccountId ?? undefined, threadId)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load thread');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeAccountId, threadId]);

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
        {thread.messages.map((msg) => (
          <div key={msg.id} className="thread-view__message">
            <div className="thread-view__message-meta">
              <span className="thread-view__message-from">{msg.from}</span>
              <span className="thread-view__message-date">{msg.date}</span>
            </div>
            <div
              className={`thread-view__message-body ${msg.bodyHtml ? 'thread-view__message-body--html' : ''}`}
              {...(msg.bodyHtml
                ? { dangerouslySetInnerHTML: { __html: msg.bodyHtml } }
                : { children: msg.bodyPlain })}
            />
          </div>
        ))}
      </div>
      <ReplyComposer ref={replyComposerRef} onSend={handleSendReply} disabled={sending} />
    </div>
  );
}

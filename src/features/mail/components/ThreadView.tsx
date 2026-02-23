import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { ArrowUpFromLine, Check, ChevronRight, Clock, Download, ListTodo, Paperclip, Trash2 } from 'lucide-react';
import { fetchThread, getThreadFromCache, doneThread, deleteThread, unarchiveThread, type ThreadDetail, type ThreadMessage } from '../mailRepository';
import { useSyncStatus } from '../useSyncStatus';
import { recordThreadCacheHit, recordThreadFetchDurationMs } from '@/lib/metrics';
import { formatEmailDate } from '../utils';
import { ParticleNavIcon } from '@/components/shared/ParticleNavIcon';
import { ReplyComposer } from './ReplyComposer';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function base64UrlDecodeToBlob(base64url: string, mimeType: string): Blob {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

interface ThreadViewProps {
  threadId: string;
  activeAccountId: string | null;
  currentUserEmail?: string | null;
  /** When true, show Unarchive instead of Done and add INBOX on action. */
  isDoneView?: boolean;
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

interface ThreadMessageRowProps {
  msg: ThreadMessage;
  isExpanded: boolean;
  fromMe: boolean;
  activeAccountId: string | null;
  onToggle: (msgId: string) => void;
  onReply: (msgId: string) => void;
  onForward: (msgId: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

const ThreadMessageRow = memo(function ThreadMessageRow({ msg, isExpanded, fromMe, activeAccountId, onToggle, onReply, onForward, registerRef }: ThreadMessageRowProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const snippet = useMemo(
    () => (msg.bodyPlain || msg.snippet || '').slice(0, 120).replace(/\n/g, ' ') || '(No content)',
    [msg.bodyPlain, msg.snippet]
  );
  const formattedDate = useMemo(() => formatEmailDate(msg.date), [msg.date]);

  const handleDownload = useCallback(
    async (attachmentId: string, filename: string, mimeType: string) => {
      const api = window.electronAPI?.gmail;
      if (!api?.getAttachment) return;
      setDownloadingId(attachmentId);
      try {
        const { data } = await api.getAttachment(activeAccountId ?? undefined, msg.id, attachmentId);
        const blob = base64UrlDecodeToBlob(data, mimeType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'attachment';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setDownloadingId(null);
      }
    },
    [activeAccountId, msg.id]
  );

  return (
    <div
      ref={(el) => registerRef(msg.id, el)}
      className={`thread-view__message ${isExpanded ? 'thread-view__message--expanded' : 'thread-view__message--collapsed'} ${fromMe ? 'thread-view__message--from-me' : ''}`}
    >
      <button
        type="button"
        className="thread-view__message-header"
        onClick={() => onToggle(msg.id)}
        aria-expanded={isExpanded}
      >
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className={`thread-view__message-chevron ${isExpanded ? 'thread-view__message-chevron--open' : ''}`}
        />
        <span className="thread-view__message-from">{msg.from}</span>
        {!isExpanded && msg.attachments && msg.attachments.length > 0 && (
          <Paperclip size={12} className="thread-view__message-attachment-icon" aria-hidden />
        )}
        {!isExpanded && <span className="thread-view__message-snippet">{snippet}</span>}
        <span className="thread-view__message-date">{formattedDate}</span>
      </button>
      {isExpanded && (
        <div className="thread-view__msg-actions">
          <button
            type="button"
            className="thread-view__msg-action-btn"
            onClick={(e) => { e.stopPropagation(); onReply(msg.id); }}
            title="Reply"
            aria-label="Reply"
          >
            <ParticleNavIcon shape="reply" size={14} />
          </button>
          <button
            type="button"
            className="thread-view__msg-action-btn"
            onClick={(e) => { e.stopPropagation(); onForward(msg.id); }}
            title="Forward"
            aria-label="Forward"
          >
            <ParticleNavIcon shape="forward" size={14} />
          </button>
        </div>
      )}
      {isExpanded && (
        <>
          <div
            className={`thread-view__message-body ${msg.bodyHtml ? 'thread-view__message-body--html' : ''}`}
            {...(msg.bodyHtml
              ? { dangerouslySetInnerHTML: { __html: msg.bodyHtml } }
              : { children: msg.bodyPlain })}
          />
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="thread-view__attachments">
              {msg.attachments.map((att) => (
                <button
                  key={att.attachmentId}
                  type="button"
                  className="thread-view__attachment-chip"
                  onClick={() => handleDownload(att.attachmentId, att.filename, att.mimeType)}
                  disabled={downloadingId === att.attachmentId}
                  title={`Download ${att.filename}`}
                >
                  <Paperclip size={14} aria-hidden />
                  <span className="thread-view__attachment-filename">{att.filename}</span>
                  <span className="thread-view__attachment-size">{formatFileSize(att.size)}</span>
                  {downloadingId === att.attachmentId ? (
                    <span className="thread-view__attachment-loading">…</span>
                  ) : (
                    <Download size={14} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export function ThreadView({ threadId, activeAccountId, currentUserEmail, isDoneView, onDone, onDelete }: ThreadViewProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const syncStatus = useSyncStatus();
  const prevSyncStatus = useRef(syncStatus);

  const scrollToBottom = useCallback((instant = false) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => {
    if (activeAccountId === undefined) return;
    const controller = new AbortController();
    const { signal } = controller;
    const cached = getThreadFromCache(activeAccountId ?? undefined, threadId);
    if (cached) {
      recordThreadCacheHit();
      setThread(cached);
      setLoading(false);
      setError(null);
      if (cached.messages.length > 0) {
        setExpandedIds(new Set([cached.messages[cached.messages.length - 1].id]));
        scrollToBottom(true);
      }
    } else {
      setLoading(true);
      setError(null);
    }
    const fetchStart = Date.now();
    fetchThread(activeAccountId ?? undefined, threadId)
      .then((t) => {
        if (signal.aborted) return;
        recordThreadFetchDurationMs(Date.now() - fetchStart);
        setThread(t);
        if (t && t.messages.length > 0) {
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.add(t.messages[t.messages.length - 1].id);
            return next;
          });
          scrollToBottom(true);
        }
      })
      .catch((e) => {
        if (!signal.aborted) setError(e instanceof Error ? e.message : 'Failed to load thread');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeAccountId, threadId, scrollToBottom]);

  // Refetch thread when sync becomes up-to-date so UI shows background updates.
  useEffect(() => {
    if (prevSyncStatus.current !== 'up-to-date' && syncStatus === 'up-to-date' && activeAccountId !== undefined) {
      fetchThread(activeAccountId ?? undefined, threadId).then((t) => {
        if (t) setThread(t);
      });
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, activeAccountId, threadId]);

  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerMsgRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) msgRefs.current.set(id, el);
    else msgRefs.current.delete(id);
  }, []);

  const displayedMessages = useMemo(
    () => (thread ? thread.messages : []),
    [thread]
  );

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

  const handleSendReply = useCallback(async (bodyText: string, attachments?: import('@/vite-env').OutgoingAttachment[]) => {
    if (!thread) return;
    setSending(true);
    try {
      const { sendReply } = await import('../mailRepository');
      await sendReply(activeAccountId ?? undefined, thread.id, bodyText, attachments);
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

  const handleUnarchive = useCallback(async () => {
    if (!thread || actionPending) return;
    setActionPending(true);
    try {
      await unarchiveThread(activeAccountId ?? undefined, thread.id);
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
    const el = replyComposerRef.current;
    if (el) {
      el.focus();
      el.closest?.('form')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  const handleReplyToMessage = useCallback((_msgId: string) => {
    focusReply();
  }, [focusReply]);

  const handleForwardMessage = useCallback((_msgId: string) => {
    // Stub: forward requires new MIME/compose flow
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
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpandedIds((prev) => {
          if (prev.size === 0) return prev;
          const last = thread?.messages[thread.messages.length - 1]?.id;
          return last ? new Set([last]) : new Set();
        });
        return;
      }
      switch (key) {
        case 'E':
          e.preventDefault();
          if (isDoneView) handleUnarchive();
          else handleDone();
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
  }, [handleDone, handleUnarchive, isDoneView, focusReply, handleReplyAll, handleReminder]);

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
            {isDoneView ? (
              <button
                type="button"
                className="thread-view__action-btn"
                onClick={handleUnarchive}
                disabled={actionPending}
                title="Unarchive (E)"
                aria-label="Unarchive"
              >
                <ArrowUpFromLine size={18} strokeWidth={1.5} />
              </button>
            ) : (
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
            )}
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
        {thread.messages.length > 2 && expandedIds.size < thread.messages.length && (
          <button
            type="button"
            className="thread-view__expand-all"
            onClick={expandAll}
          >
            {thread.messages.length - expandedIds.size} collapsed message{thread.messages.length - expandedIds.size !== 1 ? 's' : ''}
          </button>
        )}
        {displayedMessages.map((msg) => (
          <ThreadMessageRow
            key={msg.id}
            msg={msg}
            isExpanded={expandedIds.has(msg.id)}
            fromMe={isFromCurrentUser(msg.from, currentUserEmail ?? null)}
            activeAccountId={activeAccountId}
            onToggle={toggleMessage}
            onReply={handleReplyToMessage}
            onForward={handleForwardMessage}
            registerRef={registerMsgRef}
          />
        ))}
        <ReplyComposer
          ref={replyComposerRef}
          onSend={handleSendReply}
          disabled={sending}
          fromEmail={currentUserEmail ?? undefined}
          toLabel={thread.messages[thread.messages.length - 1]?.from}
        />
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

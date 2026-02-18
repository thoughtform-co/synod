import { useEffect, useState } from 'react';
import { fetchThread, type ThreadDetail } from '../mailRepository';
import { ReplyComposer } from './ReplyComposer';

interface ThreadViewProps {
  threadId: string;
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchThread(threadId)
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
  }, [threadId]);

  const handleSendReply = async (bodyText: string) => {
    if (!thread) return;
    setSending(true);
    try {
      const { sendReply } = await import('../mailRepository');
      await sendReply(thread.id, bodyText);
      const updated = await fetchThread(threadId);
      setThread(updated ?? thread);
    } finally {
      setSending(false);
    }
  };

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
        <h1 className="thread-view__subject">{subject}</h1>
      </header>
      <div className="thread-view__messages">
        {thread.messages.map((msg) => (
          <div key={msg.id} className="thread-view__message">
            <div className="thread-view__message-meta">
              <span className="thread-view__message-from">{msg.from}</span>
              <span className="thread-view__message-date">{msg.date}</span>
            </div>
            <div className="thread-view__message-body">{msg.bodyPlain}</div>
          </div>
        ))}
      </div>
      <ReplyComposer onSend={handleSendReply} disabled={sending} />
    </div>
  );
}

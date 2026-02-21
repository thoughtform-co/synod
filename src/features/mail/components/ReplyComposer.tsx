import { forwardRef, useState, useImperativeHandle, useRef, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

interface ReplyComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  fromEmail?: string;
  toLabel?: string;
}

export const ReplyComposer = forwardRef<HTMLTextAreaElement | null, ReplyComposerProps>(function ReplyComposer(
  { onSend, disabled, fromEmail, toLabel },
  ref
) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(ref, () => textareaRef.current);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || disabled || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setBody('');
      setExpanded(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textareaRef.current?.form?.requestSubmit();
    }
  }, []);

  const expand = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const hasText = body.trim().length > 0;

  return (
    <form
      className={`thread-view__message thread-view__message--reply ${expanded ? 'thread-view__message--expanded' : 'thread-view__message--collapsed'}`}
      onSubmit={handleSubmit}
    >
      <div
        className="thread-view__message-header"
        onClick={!expanded ? expand : undefined}
        role={!expanded ? 'button' : undefined}
        tabIndex={!expanded ? 0 : undefined}
      >
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className={`thread-view__message-chevron ${expanded ? 'thread-view__message-chevron--open' : ''}`}
        />
        <span className="thread-view__message-from">{fromEmail ?? 'You'}</span>
        {!expanded && (
          <span className="thread-view__message-snippet">Write a reply…</span>
        )}
        {expanded && toLabel && (
          <span className="thread-view__reply-to">To: {toLabel}</span>
        )}
        {expanded && hasText && (
          <button
            type="submit"
            className="thread-view__reply-send"
            disabled={!hasText || disabled || sending}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        )}
      </div>
      {expanded && (
        <textarea
          ref={textareaRef}
          className="thread-view__message-body thread-view__reply-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply…"
          rows={5}
          disabled={disabled}
        />
      )}
    </form>
  );
});

import { forwardRef, useState, useImperativeHandle, useRef, useEffect } from 'react';

interface ReplyComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

function formatComposerTime(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const ReplyComposer = forwardRef<HTMLTextAreaElement | null, ReplyComposerProps>(function ReplyComposer(
  { onSend, disabled },
  ref
) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [composerTime, setComposerTime] = useState(formatComposerTime);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(ref, () => textareaRef.current);

  useEffect(() => {
    const t = setInterval(() => setComposerTime(formatComposerTime()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || disabled || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setBody('');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="reply-composer reply-composer--inline" onSubmit={handleSubmit}>
      <div className="reply-composer__header">
        <span className="reply-composer__from">You</span>
        <span className="reply-composer__label">Reply</span>
        <span className="reply-composer__date">{composerTime}</span>
      </div>
      <textarea
        ref={textareaRef}
        className="reply-composer__input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={3}
        disabled={disabled}
      />
      <div className="reply-composer__footer">
        <button
          type="submit"
          className="reply-composer__send"
          disabled={!body.trim() || disabled || sending}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
});

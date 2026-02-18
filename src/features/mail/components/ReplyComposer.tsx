import { useState } from 'react';

interface ReplyComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

export function ReplyComposer({ onSend, disabled }: ReplyComposerProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

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
    <form className="reply-composer" onSubmit={handleSubmit}>
      <textarea
        className="reply-composer__input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={4}
        disabled={disabled}
      />
      <button
        type="submit"
        className="reply-composer__send"
        disabled={!body.trim() || disabled || sending}
      >
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

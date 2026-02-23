import { forwardRef, useState, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { OutgoingAttachment } from '@/vite-env';
import { DiscardDraftDialog } from '@/components/shared/DiscardDraftDialog';

function fileToOutgoingAttachment(file: File): Promise<OutgoingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result.startsWith('data:')) {
        reject(new Error('Invalid read'));
        return;
      }
      const base64 = result.replace(/^data:[^;]+;base64,/, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      resolve({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: base64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ReplyComposerProps {
  onSend: (body: string, attachments?: OutgoingAttachment[]) => Promise<void>;
  disabled?: boolean;
  fromEmail?: string;
  toLabel?: string;
}

export const ReplyComposer = forwardRef<HTMLTextAreaElement | null, ReplyComposerProps>(function ReplyComposer(
  { onSend, disabled, fromEmail, toLabel },
  ref
) {
  const UNDO_SECONDS = 15;
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSendRef = useRef<{ body: string; attachments: OutgoingAttachment[] | undefined } | null>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(ref, () => textareaRef.current);

  const performSend = useCallback(() => {
    const pending = pendingSendRef.current;
    pendingSendRef.current = null;
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (!pending) return;
    setSending(true);
    onSend(pending.body, pending.attachments)
      .then(() => {
        setBody('');
        setAttachments([]);
        setExpanded(false);
      })
      .finally(() => setSending(false));
  }, [onSend]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || disabled || sending || undoCountdown > 0) return;
    pendingSendRef.current = { body: text, attachments: attachments.length > 0 ? attachments : undefined };
    setUndoCountdown(UNDO_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setUndoCountdown((s) => {
        if (s <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    sendTimeoutRef.current = setTimeout(() => {
      sendTimeoutRef.current = null;
      setUndoCountdown(0);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      performSend();
    }, UNDO_SECONDS * 1000);
  };

  const handleUndoSend = useCallback(() => {
    pendingSendRef.current = null;
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setUndoCountdown(0);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && (hasText || attachments.length > 0) && undoCountdown === 0) {
      e.preventDefault();
      setShowDiscardConfirm(true);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textareaRef.current?.form?.requestSubmit();
    }
  }, [hasText, attachments.length, undoCountdown]);

  const handleDiscardReply = useCallback(() => {
    setBody('');
    setAttachments([]);
    setExpanded(false);
    setShowDiscardConfirm(false);
  }, []);

  const expand = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    Promise.all(Array.from(files).map(fileToOutgoingAttachment)).then((list) => {
      setAttachments((prev) => [...prev, ...list]);
    });
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const hasText = body.trim().length > 0;

  const handleSendLater = useCallback(() => {
    // Stub: future scheduled send
  }, []);

  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onComposeSend = () => {
      if (formRef.current?.contains(document.activeElement) && hasText && !sending && undoCountdown === 0) {
        formRef.current.requestSubmit();
      }
    };
    document.addEventListener('compose:send', onComposeSend);
    return () => document.removeEventListener('compose:send', onComposeSend);
  }, [hasText, sending, undoCountdown]);

  return (
    <div className="thread-view__reply-divider">
      <DiscardDraftDialog
        open={showDiscardConfirm}
        onDiscard={handleDiscardReply}
        onKeepEditing={() => setShowDiscardConfirm(false)}
      />
      <form
        ref={formRef}
        className={`thread-view__message thread-view__message--reply ${expanded ? 'thread-view__message--expanded' : 'thread-view__message--collapsed'} ${undoCountdown > 0 ? 'thread-view__message--send-countdown' : ''}`}
        onSubmit={handleSubmit}
      >
        <div
          className="thread-view__reply-header"
          onClick={!expanded ? expand : undefined}
          role={!expanded ? 'button' : undefined}
          tabIndex={!expanded ? 0 : undefined}
          onKeyDown={!expanded ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } } : undefined}
        >
          <span className="thread-view__message-from">{fromEmail ?? 'You'}</span>
          {!expanded && (
            <span className="thread-view__reply-placeholder">Write a reply…</span>
          )}
          {expanded && toLabel && (
            <span className="thread-view__reply-to">To: {toLabel}</span>
          )}
        </div>
        {expanded && (
          <>
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
            {attachments.length > 0 && (
              <div className="thread-view__reply-attachments">
                {attachments.map((att, i) => (
                  <span key={i} className="thread-view__reply-attachment-chip">
                    <span className="thread-view__reply-attachment-name">{att.filename}</span>
                    <button type="button" className="thread-view__reply-attachment-remove" onClick={() => removeAttachment(i)} aria-label={`Remove ${att.filename}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {undoCountdown > 0 && (
              <div className="thread-view__reply-undo-bar">
                <span className="thread-view__reply-undo-text">Sending in {undoCountdown}s…</span>
                <button type="button" className="thread-view__reply-undo-btn" onClick={handleUndoSend}>
                  Undo
                </button>
              </div>
            )}
            <div className="thread-view__reply-footer">
              <button type="button" className="thread-view__reply-attach" onClick={handleAttach} title="Attach files" aria-label="Attach files">
                <Paperclip size={16} strokeWidth={1.5} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="thread-view__reply-file-input"
                onChange={handleFileChange}
                aria-hidden
              />
              <div className="thread-view__reply-footer-actions">
                <button type="button" className="thread-view__reply-send-later" onClick={handleSendLater}>
                  Send later
                </button>
                <button
                  type="submit"
                  className="thread-view__reply-send"
                  disabled={!hasText || disabled || sending || undoCountdown > 0}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
});

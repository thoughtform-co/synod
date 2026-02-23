import { useState, useCallback, useRef, useEffect } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { OutgoingAttachment } from '@/vite-env';
import { DiscardDraftDialog } from '@/components/shared/DiscardDraftDialog';
import { createDraft, updateDraft, deleteDraft, sendNewMessage } from '../mailRepository';

const AUTO_SAVE_MS = 5000;

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

interface ComposeViewProps {
  activeAccountId: string | null;
  fromEmail: string;
  onClose: () => void;
  onSent?: () => void;
}

export function ComposeView({ activeAccountId, fromEmail, onClose, onSent }: ComposeViewProps) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const UNDO_SECONDS = 15;
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSaveRef = useRef<{ to: string; cc: string; bcc: string; subject: string; body: string }>({ to: '', cc: '', bcc: '', subject: '', body: '' });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasContent = to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.trim() || attachments.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !hasContent || undoCountdown > 0) return;
      if (!containerRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setShowDiscardConfirm(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasContent, undoCountdown]);

  const handleDiscardDraft = useCallback(async () => {
    if (draftId && activeAccountId) {
      try {
        await deleteDraft(activeAccountId, draftId);
      } catch {
        // continue to close
      }
    }
    setShowDiscardConfirm(false);
    onClose();
  }, [activeAccountId, draftId, onClose]);

  const performSave = useCallback(async () => {
    if (!activeAccountId) return;
    setSaving(true);
    setError(null);
    try {
      if (draftId) {
        await updateDraft(activeAccountId, draftId, to, cc, bcc, subject, body, attachments);
      } else {
        const res = await createDraft(activeAccountId, to, cc, bcc, subject, body, attachments);
        setDraftId(res.id);
      }
      setDraftSavedAt(new Date());
      lastSaveRef.current = { to, cc, bcc, subject, body };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }, [activeAccountId, draftId, to, cc, bcc, subject, body, attachments]);

  useEffect(() => {
    if (!hasContent || !activeAccountId) return;
    const current = { to, cc, bcc, subject, body };
    const last = lastSaveRef.current;
    const unchanged =
      last.to === current.to &&
      last.cc === current.cc &&
      last.bcc === current.bcc &&
      last.subject === current.subject &&
      last.body === current.body;
    if (unchanged) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(performSave, AUTO_SAVE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [hasContent, activeAccountId, to, cc, bcc, subject, body, performSave]);

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

  const performSend = useCallback(async () => {
    if (!activeAccountId || !to.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (draftId) {
        await updateDraft(activeAccountId, draftId, to, cc, bcc, subject, body, attachments);
        const { sendDraft } = await import('../mailRepository');
        await sendDraft(activeAccountId, draftId);
      } else {
        await sendNewMessage(activeAccountId, to, cc, bcc, subject, body, attachments);
      }
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [activeAccountId, draftId, to, cc, bcc, subject, body, attachments, onClose, onSent]);

  const handleSend = useCallback(() => {
    if (!activeAccountId || !to.trim() || sending || undoCountdown > 0) return;
    setUndoCountdown(UNDO_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setUndoCountdown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    sendTimeoutRef.current = setTimeout(() => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      sendTimeoutRef.current = null;
      setUndoCountdown(0);
      performSend();
    }, UNDO_SECONDS * 1000);
  }, [activeAccountId, to, sending, undoCountdown, performSend]);

  const handleUndoSend = useCallback(() => {
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

  const handleSendLater = useCallback(() => {
    // Stub: future scheduled send
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onComposeSend = () => {
      if (containerRef.current?.contains(document.activeElement) && to.trim() && !sending && undoCountdown === 0) {
        handleSend();
      }
    };
    document.addEventListener('compose:send', onComposeSend);
    return () => document.removeEventListener('compose:send', onComposeSend);
  }, [to, sending, undoCountdown, handleSend]);

  return (
    <div ref={containerRef} className={`compose-view ${undoCountdown > 0 ? 'compose-view--send-countdown' : ''}`}>
      <DiscardDraftDialog
        open={showDiscardConfirm}
        onDiscard={handleDiscardDraft}
        onKeepEditing={() => setShowDiscardConfirm(false)}
      />
      <header className="compose-view__header">
        <h1 className="compose-view__title">New message</h1>
        <div className="compose-view__header-actions">
          {draftSavedAt && (
            <span className="compose-view__draft-saved">
              Draft saved {draftSavedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" className="compose-view__close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="compose-view__form">
        <div className="compose-view__field">
          <label className="compose-view__label">From</label>
          <span className="compose-view__from">{fromEmail}</span>
        </div>
        <div className="compose-view__field">
          <label className="compose-view__label">To</label>
          <input
            type="text"
            className="compose-view__input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Recipients"
          />
        </div>
        {showCc && (
          <div className="compose-view__field">
            <label className="compose-view__label">Cc</label>
            <input
              type="text"
              className="compose-view__input"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Cc"
            />
          </div>
        )}
        {showBcc && (
          <div className="compose-view__field">
            <label className="compose-view__label">Bcc</label>
            <input
              type="text"
              className="compose-view__input"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="Bcc"
            />
          </div>
        )}
        <div className="compose-view__field compose-view__field--row">
          {!showCc && (
            <button type="button" className="compose-view__link" onClick={() => setShowCc(true)}>
              Cc
            </button>
          )}
          {!showBcc && (
            <button type="button" className="compose-view__link" onClick={() => setShowBcc(true)}>
              Bcc
            </button>
          )}
        </div>
        <div className="compose-view__field">
          <label className="compose-view__label">Subject</label>
          <input
            type="text"
            className="compose-view__input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Add a subject"
          />
        </div>
        <div className="compose-view__field compose-view__field--body">
          <textarea
            className="compose-view__body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type / to insert files and more"
            rows={12}
          />
        </div>
        {attachments.length > 0 && (
          <div className="compose-view__attachments">
            {attachments.map((att, i) => (
              <span key={i} className="compose-view__attachment-chip">
                <span className="compose-view__attachment-name">{att.filename}</span>
                <button type="button" className="compose-view__attachment-remove" onClick={() => removeAttachment(i)} aria-label={`Remove ${att.filename}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {error && <div className="compose-view__error">{error}</div>}
        {undoCountdown > 0 && (
          <div className="compose-view__undo-bar">
            <span className="compose-view__undo-text">Sending in {undoCountdown}s…</span>
            <button type="button" className="compose-view__undo-btn" onClick={handleUndoSend}>
              Undo
            </button>
          </div>
        )}
        <footer className="compose-view__footer">
          <button type="button" className="compose-view__attach" onClick={handleAttach} title="Attach files" aria-label="Attach files">
            <Paperclip size={18} strokeWidth={1.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="compose-view__file-input"
            onChange={handleFileChange}
            aria-hidden
          />
          <div className="compose-view__footer-actions">
            <button type="button" className="compose-view__send-later" onClick={handleSendLater}>
              Send later
            </button>
            <button
              type="button"
              className="compose-view__send"
              onClick={handleSend}
              disabled={!to.trim() || sending || undoCountdown > 0}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

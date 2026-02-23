import { useEffect } from 'react';

interface DiscardDraftDialogProps {
  open: boolean;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

export function DiscardDraftDialog({ open, onDiscard, onKeepEditing }: DiscardDraftDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onKeepEditing();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onKeepEditing]);

  if (!open) return null;

  return (
    <div className="discard-draft-overlay" role="dialog" aria-modal="true" aria-labelledby="discard-draft-title">
      <div className="discard-draft-backdrop" onClick={onKeepEditing} aria-hidden />
      <div className="discard-draft-dialog">
        <h2 id="discard-draft-title" className="discard-draft-title">
          Discard this draft?
        </h2>
        <div className="discard-draft-actions">
          <button type="button" className="discard-draft-btn discard-draft-btn--keep" onClick={onKeepEditing}>
            Keep editing
          </button>
          <button type="button" className="discard-draft-btn discard-draft-btn--discard" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

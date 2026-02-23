import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ParticleNavIcon } from '@/components/shared/ParticleNavIcon';

const AUTO_DISMISS_MS = 8000;
const MAX_TOASTS = 3;

export interface ToastItem {
  id: string;
  type: 'reminder' | 'mail';
  title: string;
  body: string;
  timestamp: number;
}

interface ToastNotificationProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

function formatToastTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ToastNotification({ toasts, onDismiss }: ToastNotificationProps) {
  return (
    <div className="synod-toast-container" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const iconShape = item.type === 'reminder' ? 'reminder' : 'inbox';

  return (
    <div
      className={`synod-toast ${visible ? 'synod-toast--visible' : ''}`}
      role="status"
    >
      <div className="synod-toast__icon">
        <ParticleNavIcon shape={iconShape} size={16} />
      </div>
      <div className="synod-toast__content">
        <p className="synod-toast__title">{item.title}</p>
        <p className="synod-toast__body">{item.body}</p>
        <span className="synod-toast__time">{formatToastTime(item.timestamp)}</span>
      </div>
      <button
        type="button"
        className="synod-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const addToast = useCallback((item: Omit<ToastItem, 'id' | 'timestamp'>) => {
    const ts = Date.now();
    const id = `toast-${nextIdRef.current++}`;
    setToasts((prev) => {
      const next = [...prev, { ...item, id, timestamp: ts }];
      if (next.length > MAX_TOASTS) return next.slice(-MAX_TOASTS);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismiss };
}

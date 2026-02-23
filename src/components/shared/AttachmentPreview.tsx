import { useCallback, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50MB

type CacheEntry = { blob: Blob; size: number; at: number };
const cache = new Map<string, CacheEntry>();
let cacheTotal = 0;
const cacheOrder: string[] = [];

function cacheKey(accountId: string, messageId: string, attachmentId: string): string {
  return `${accountId}:${messageId}:${attachmentId}`;
}

function evictLRU(needFree: number): void {
  while (cacheOrder.length > 0 && cacheTotal > 0 && cacheTotal + needFree > MAX_CACHE_BYTES) {
    const key = cacheOrder.shift();
    if (!key) break;
    const ent = cache.get(key);
    if (ent) {
      cacheTotal -= ent.size;
      cache.delete(key);
    }
  }
}

function getCached(accountId: string, messageId: string, attachmentId: string): Blob | null {
  const key = cacheKey(accountId, messageId, attachmentId);
  const ent = cache.get(key);
  if (!ent) return null;
  ent.at = Date.now();
  const idx = cacheOrder.indexOf(key);
  if (idx >= 0) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
  return ent.blob;
}

function setCache(accountId: string, messageId: string, attachmentId: string, blob: Blob): void {
  const key = cacheKey(accountId, messageId, attachmentId);
  const size = blob.size;
  evictLRU(size);
  if (cache.has(key)) {
    const old = cache.get(key)!;
    cacheTotal -= old.size;
    const idx = cacheOrder.indexOf(key);
    if (idx >= 0) cacheOrder.splice(idx, 1);
  }
  cache.set(key, { blob, size, at: Date.now() });
  cacheOrder.push(key);
  cacheTotal += size;
}

function base64UrlDecodeToBlob(base64url: string, mimeType: string): Blob {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isPreviewablePdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export function isPreviewable(mimeType: string): boolean {
  return isPreviewableImage(mimeType) || isPreviewablePdf(mimeType);
}

interface AttachmentPreviewProps {
  accountId: string | undefined;
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  onClose: () => void;
}

export function AttachmentPreview({
  accountId,
  messageId,
  attachmentId,
  filename,
  mimeType,
  size,
  onClose,
}: AttachmentPreviewProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const fetchAndSet = useCallback(async () => {
    const api = window.electronAPI?.gmail;
    if (!api?.getAttachment || !accountId) {
      setError('Unable to load attachment');
      setLoading(false);
      return;
    }
    const cached = getCached(accountId, messageId, attachmentId);
    if (cached) {
      setBlob(cached);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.getAttachment(accountId, messageId, attachmentId);
      const b = base64UrlDecodeToBlob(data, mimeType);
      setCache(accountId, messageId, attachmentId, b);
      setBlob(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [accountId, messageId, attachmentId, mimeType]);

  useEffect(() => {
    fetchAndSet();
  }, [fetchAndSet]);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [blob]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'attachment';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [blob, filename]);

  const isImage = isPreviewableImage(mimeType);
  const isPdf = isPreviewablePdf(mimeType);

  return (
    <div className="synod-attachment-preview-backdrop" onClick={onClose} role="presentation" aria-hidden>
      <div
        className="synod-attachment-preview"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Attachment preview"
      >
        <header className="synod-attachment-preview__header">
          <div className="synod-attachment-preview__meta">
            <span className="synod-attachment-preview__filename" title={filename}>{filename}</span>
            <span className="synod-attachment-preview__size">{formatFileSize(size)}</span>
          </div>
          <div className="synod-attachment-preview__actions">
            <button
              type="button"
              className="synod-attachment-preview__download"
              onClick={handleDownload}
              disabled={!blob}
              aria-label="Download"
            >
              <Download size={14} strokeWidth={1.5} />
            </button>
            <button type="button" className="synod-attachment-preview__close" onClick={onClose} aria-label="Close">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <div className="synod-attachment-preview__body">
          {loading && <p className="synod-attachment-preview__loading">Loading…</p>}
          {error && <p className="synod-attachment-preview__error">{error}</p>}
          {!loading && !error && blob && objectUrl && isImage && (
            <img src={objectUrl} alt={filename} className="synod-attachment-preview__img" />
          )}
          {!loading && !error && blob && objectUrl && isPdf && (
            <iframe src={objectUrl} title={filename} className="synod-attachment-preview__iframe" />
          )}
        </div>
      </div>
    </div>
  );
}

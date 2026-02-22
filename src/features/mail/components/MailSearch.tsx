import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { SearchResult, LocalSearchResult } from '@/vite-env';

type SearchMode = 'keyword' | 'semantic' | 'hybrid';
const MODE_LABELS: Record<SearchMode, string> = { keyword: 'Fast', semantic: 'AI', hybrid: 'Hybrid' };
const MODES: SearchMode[] = ['keyword', 'semantic', 'hybrid'];
const CATEGORIES = ['main', 'subscription', 'promotion', 'social', 'update', 'transactional', 'other'] as const;
const CAT_LABELS: Record<string, string> = { '': 'All', main: 'Main', subscription: 'Subs', promotion: 'Promo', social: 'Social', update: 'Updates', transactional: 'Transact.', other: 'Other' };

interface MailSearchProps {
  activeAccountId: string | null;
  accountIds: string[];
  onSelectThread: (threadId: string) => void;
  onLocalResults: (results: LocalSearchResult[]) => void;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener('mousedown', cb);
    return () => document.removeEventListener('mousedown', cb);
  }, [ref, handler]);
}

export function MailSearch({ activeAccountId, accountIds, onSelectThread, onLocalResults }: MailSearchProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('keyword');
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  const modeRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useClickOutside(modeRef, () => setModeOpen(false));
  useClickOutside(catRef, () => setCatOpen(false));

  const api = window.electronAPI?.search;

  useEffect(() => {
    api?.isConfigured?.().then(setCloudConfigured);
  }, [api]);

  const runLocalSearch = useCallback((q: string) => {
    if (!q.trim() || !activeAccountId) {
      onLocalResults([]);
      return;
    }
    api?.local?.(activeAccountId, q, 20).then(onLocalResults).catch(() => onLocalResults([]));
  }, [api, activeAccountId, onLocalResults]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      onLocalResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runLocalSearch(value), 150);
  }, [runLocalSearch, onLocalResults]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const runCloudSearch = useCallback(async () => {
    if (!api || !query.trim() || !cloudConfigured) return;
    setLoading(true);
    try {
      const ids = accountIds.length > 0 ? accountIds : (activeAccountId ? [activeAccountId] : []);
      const cat = category || undefined;
      let list: SearchResult[] = [];
      if (mode === 'keyword') list = await api.keyword(ids, query, 50, cat);
      else if (mode === 'semantic') list = await api.semantic(ids, query, 50, cat);
      else list = await api.hybrid(ids, query, 50, cat);
      const mapped: LocalSearchResult[] = list.map((r) => ({
        threadId: r.threadId,
        subject: r.subject,
        from: r.from,
        snippet: r.snippet,
        internalDate: r.internalDate,
      }));
      onLocalResults(mapped);
    } catch {
      onLocalResults([]);
    } finally {
      setLoading(false);
    }
  }, [api, query, mode, category, accountIds, activeAccountId, cloudConfigured, onLocalResults]);

  return (
    <div className="mail-search">
      <div className="mail-search__bar" onClick={() => inputRef.current?.focus()}>
        <Search size={14} strokeWidth={1.5} className="mail-search__icon" />
        <input
          ref={inputRef}
          type="text"
          className="mail-search__input"
          placeholder="Search mail…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runCloudSearch();
            if (e.key === 'Escape') { setQuery(''); onLocalResults([]); }
          }}
          aria-label="Search mail"
        />
        {loading && <span className="mail-search__spinner" />}
        {cloudConfigured && (
          <div className="mail-search__filters">
            <div className="mail-search__filter" ref={modeRef}>
              <button
                type="button"
                className="mail-search__pill"
                onClick={(e) => { e.stopPropagation(); setModeOpen((v) => !v); setCatOpen(false); }}
                aria-expanded={modeOpen}
              >
                {MODE_LABELS[mode]}
                <ChevronDown size={10} strokeWidth={2} className={`mail-search__pill-chevron ${modeOpen ? 'mail-search__pill-chevron--open' : ''}`} />
              </button>
              {modeOpen && (
                <ul className="mail-search__dropdown" role="listbox">
                  {MODES.map((m) => (
                    <li key={m} role="option" aria-selected={m === mode}>
                      <button
                        type="button"
                        className={`mail-search__dropdown-item ${m === mode ? 'mail-search__dropdown-item--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setMode(m); setModeOpen(false); }}
                      >
                        {MODE_LABELS[m]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="mail-search__sep" />
            <div className="mail-search__filter" ref={catRef}>
              <button
                type="button"
                className="mail-search__pill"
                onClick={(e) => { e.stopPropagation(); setCatOpen((v) => !v); setModeOpen(false); }}
                aria-expanded={catOpen}
              >
                {CAT_LABELS[category] ?? 'All'}
                <ChevronDown size={10} strokeWidth={2} className={`mail-search__pill-chevron ${catOpen ? 'mail-search__pill-chevron--open' : ''}`} />
              </button>
              {catOpen && (
                <ul className="mail-search__dropdown" role="listbox">
                  <li role="option" aria-selected={category === ''}>
                    <button
                      type="button"
                      className={`mail-search__dropdown-item ${category === '' ? 'mail-search__dropdown-item--active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setCategory(''); setCatOpen(false); }}
                    >
                      All
                    </button>
                  </li>
                  {CATEGORIES.map((c) => (
                    <li key={c} role="option" aria-selected={c === category}>
                      <button
                        type="button"
                        className={`mail-search__dropdown-item ${c === category ? 'mail-search__dropdown-item--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setCategory(c); setCatOpen(false); }}
                      >
                        {CAT_LABELS[c] ?? c}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

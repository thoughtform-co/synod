import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CalendarEvent } from '../calendarClient';

const MAX_RESULTS = 6;

function formatSnippetDate(ev: CalendarEvent): string {
  const d = new Date(ev.start);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function formatSnippetTime(ev: CalendarEvent): string {
  if (ev.isAllDay) return 'All day';
  const s = new Date(ev.start);
  return s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface CalendarSearchProps {
  events: CalendarEvent[];
  onNavigate: (event: CalendarEvent) => void;
}

export function CalendarSearch({ events, onNavigate }: CalendarSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matched = events.filter((ev) => {
      const summary = (ev.summary ?? '').toLowerCase();
      const desc = (ev.description ?? '').toLowerCase();
      const loc = (ev.location ?? '').toLowerCase();
      return summary.includes(q) || desc.includes(q) || loc.includes(q);
    });
    return matched.slice(0, MAX_RESULTS);
  }, [events, query]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setOpen(false);
  }, []);

  const handleSelect = useCallback(
    (ev: CalendarEvent) => {
      onNavigate(ev);
      clearSearch();
    },
    [onNavigate, clearSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="synod-cal__search" ref={containerRef}>
      <div className="synod-cal__search-bar" onClick={() => containerRef.current?.querySelector('input')?.focus()}>
        <Search size={14} strokeWidth={1.5} className="synod-cal__search-icon" />
        <input
          type="text"
          className="synod-cal__search-input"
          placeholder="Search events…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clearSearch();
          }}
          aria-label="Search calendar events"
        />
        {query.length > 0 && (
          <button
            type="button"
            className="synod-cal__search-clear"
            onClick={(e) => {
              e.stopPropagation();
              clearSearch();
            }}
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {showDropdown && (
        <ul className="synod-cal__search-dropdown" role="listbox">
          {results.length === 0 ? (
            <li className="synod-cal__search-empty">No events match</li>
          ) : (
            results.map((ev) => (
              <li key={ev.id} role="option">
                <button
                  type="button"
                  className="synod-cal__search-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(ev);
                  }}
                >
                  <span className="synod-cal__search-item-title">{ev.summary || '(No title)'}</span>
                  <span className="synod-cal__search-item-meta">
                    {formatSnippetDate(ev)} · {formatSnippetTime(ev)}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { ParticleNavIcon } from '@/components/shared/ParticleNavIcon';
import type { ParticleNavShapeKey } from '@/components/shared/particleNavShapes';
import type { AccountsListResult } from '@/vite-env.d';
import type { MailView } from '../mailRepository';

export type { MailView };

interface LabelItem {
  id: string;
  name: string;
  shape: ParticleNavShapeKey;
  view: MailView;
  dividerAfter?: boolean;
}

const LABEL_ITEMS: LabelItem[] = [
  { id: 'INBOX', name: 'Inbox', shape: 'inbox', view: { type: 'label', labelId: 'INBOX' } },
  { id: 'snoozed', name: 'Snoozed', shape: 'snoozed', view: { type: 'query', query: 'is:snoozed' } },
  { id: 'done', name: 'Done', shape: 'done', view: { type: 'query', query: '-in:inbox -in:spam -in:trash' }, dividerAfter: true },
  { id: 'DRAFT', name: 'Drafts', shape: 'drafts', view: { type: 'label', labelId: 'DRAFT' } },
  { id: 'SENT', name: 'Sent', shape: 'sent', view: { type: 'label', labelId: 'SENT' } },
  { id: 'invites', name: 'Invites', shape: 'invites', view: { type: 'query', query: 'has:invite' }, dividerAfter: true },
  { id: 'CATEGORY_PROMOTIONS', name: 'Promotions', shape: 'promotions', view: { type: 'label', labelId: 'CATEGORY_PROMOTIONS' } },
  { id: 'CATEGORY_SOCIAL', name: 'Social', shape: 'social', view: { type: 'label', labelId: 'CATEGORY_SOCIAL' } },
  { id: 'CATEGORY_UPDATES', name: 'Updates', shape: 'updates', view: { type: 'label', labelId: 'CATEGORY_UPDATES' } },
  { id: 'SPAM', name: 'Spam', shape: 'spam', view: { type: 'label', labelId: 'SPAM' } },
];

interface MailSidebarProps {
  accountsResult: AccountsListResult | null;
  activeAccountId: string | null;
  currentView: MailView;
  onSetActive: (accountId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onViewChange: (view: MailView) => void;
  onOpenSettings: () => void;
  onAddAccount: () => void;
  onIndexAccount: () => void;
  refreshAccounts: () => void;
}

function viewsMatch(a: MailView, b: MailView): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'label' && b.type === 'label') return a.labelId === b.labelId;
  if (a.type === 'query' && b.type === 'query') return a.query === b.query;
  return false;
}

export function MailSidebar({
  accountsResult,
  activeAccountId,
  currentView,
  onSetActive,
  onViewChange,
  onOpenSettings,
  onAddAccount,
  onIndexAccount,
}: MailSidebarProps) {
  const accounts = accountsResult?.accounts ?? [];
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropdownOpen]);

  return (
    <nav className="mail-sidebar">
      {/* Account switcher */}
      <div className="sidebar-account-switcher" ref={dropdownRef}>
        <button
          type="button"
          className="sidebar-account-switcher__trigger"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <span className="sidebar-account-switcher__avatar">
            {activeAccount?.email?.slice(0, 1).toUpperCase() ?? '?'}
          </span>
          <span className="sidebar-account-switcher__email">
            {activeAccount?.email ?? 'No account'}
          </span>
          <ChevronDown size={14} strokeWidth={1.5} className={`sidebar-account-switcher__chevron ${dropdownOpen ? 'sidebar-account-switcher__chevron--open' : ''}`} />
        </button>

        {dropdownOpen && (
          <ul className="sidebar-account-switcher__menu" role="listbox">
            {accounts.map((acc) => (
              <li key={acc.id} role="option" aria-selected={acc.id === activeAccountId}>
                <button
                  type="button"
                  className={`sidebar-account-switcher__option ${acc.id === activeAccountId ? 'sidebar-account-switcher__option--active' : ''}`}
                  onClick={() => {
                    onSetActive(acc.id);
                    setDropdownOpen(false);
                  }}
                >
                  <span className="sidebar-account-switcher__option-avatar">
                    {acc.email.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sidebar-account-switcher__option-email">{acc.email}</span>
                </button>
              </li>
            ))}
            <li className="sidebar-account-switcher__divider" />
            <li>
              <button
                type="button"
                className="sidebar-account-switcher__option"
                onClick={() => {
                  setDropdownOpen(false);
                  onAddAccount();
                }}
              >
                <Plus size={14} strokeWidth={1.5} />
                <span>Add account</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="sidebar-account-switcher__option"
                onClick={() => {
                  setDropdownOpen(false);
                  onIndexAccount();
                }}
              >
                <ParticleNavIcon shape="embed" size={14} />
                <span>Index emails</span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {/* Label list */}
      <ul className="sidebar-labels">
        {LABEL_ITEMS.map((item) => {
          const isSelected = viewsMatch(currentView, item.view);
          return (
            <li key={item.id} className={item.dividerAfter ? 'sidebar-labels__divider-after' : ''}>
              <button
                type="button"
                className={`sidebar-labels__item ${isSelected ? 'sidebar-labels__item--active' : ''} ${item.id === 'done' ? 'sidebar-labels__item--done' : ''}`}
                onClick={() => onViewChange(item.view)}
              >
                <ParticleNavIcon shape={item.shape} size={18} active={isSelected} />
                <span>{item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Bottom actions */}
      <div className="mail-sidebar__bottom">
        <button type="button" className="mail-sidebar__bottom-btn" onClick={onOpenSettings} aria-label="Settings">
          <ParticleNavIcon shape="settings" size={18} />
          <span>Settings</span>
        </button>
      </div>
    </nav>
  );
}

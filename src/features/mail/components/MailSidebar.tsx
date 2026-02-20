import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Settings, Plus, ChevronLeft, ChevronRight, Inbox, Mail, Send, Megaphone, Users, Bell, AlertTriangle, GripVertical } from 'lucide-react';
import type { AccountEntry, AccountsListResult } from '@/vite-env.d';
import { storeGet, storeSet } from '@/lib/db/sqlite';
import type { MailView } from '../mailRepository';

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

export type { MailView };

const LABEL_ITEMS: { id: string; name: string; icon: typeof Inbox }[] = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'invites', name: 'Invites', icon: Mail },
  { id: 'SENT', name: 'Sent', icon: Send },
  { id: 'CATEGORY_PROMOTIONS', name: 'Promotions', icon: Megaphone },
  { id: 'CATEGORY_SOCIAL', name: 'Social', icon: Users },
  { id: 'CATEGORY_UPDATES', name: 'Updates', icon: Bell },
  { id: 'SPAM', name: 'Spam', icon: AlertTriangle },
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
  refreshAccounts: () => void;
}

function AccountRowSortable({
  account,
  isActive,
  isCollapsed,
  onSelect,
  onViewChange,
  currentView,
}: {
  account: AccountEntry;
  isActive: boolean;
  isCollapsed: boolean;
  onSelect: () => void;
  onViewChange: (view: MailView) => void;
  currentView: MailView;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: account.id });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
  const initial = account.email.slice(0, 1).toUpperCase();

  if (isCollapsed) {
    return (
      <li ref={setNodeRef} style={style} className="account-row account-row--collapsed">
        <button
          type="button"
          className={`account-row__avatar ${isActive ? 'account-row__avatar--active' : ''}`}
          onClick={onSelect}
          title={account.email}
          aria-label={account.email}
        >
          {initial}
        </button>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`account-row ${isDragging ? 'account-row--dragging' : ''}`}>
      <div className="account-row__head">
        <button
          type="button"
          className="account-row__drag"
          aria-label="Reorder account"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className={`account-row__avatar ${isActive ? 'account-row__avatar--active' : ''}`}
          onClick={onSelect}
          title={account.email}
        >
          {initial}
        </button>
        <span className="account-row__email" title={account.email}>
          {account.email}
        </span>
      </div>
      <ul className="account-row__labels">
        {LABEL_ITEMS.map((item) => {
          const view: MailView = item.id === 'invites' ? { type: 'query', query: 'has:invite' } : { type: 'label', labelId: item.id };
          const isSelected =
            currentView.type === view.type &&
            (view.type === 'label' ? currentView.type === 'label' && currentView.labelId === view.labelId : currentView.type === 'query' && currentView.query === view.query);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`label-nav__item ${isSelected ? 'label-nav__item--active' : ''}`}
                onClick={() => onViewChange(view)}
              >
                <Icon size={14} strokeWidth={1.5} />
                <span>{item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function MailSidebar({
  accountsResult,
  activeAccountId,
  currentView,
  onSetActive,
  onReorder,
  onViewChange,
  onOpenSettings,
  onAddAccount,
  refreshAccounts: _refreshAccounts,
}: MailSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const accounts = accountsResult?.accounts ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    storeGet<boolean>(SIDEBAR_COLLAPSED_KEY).then((v) => {
      if (typeof v === 'boolean') setCollapsed(v);
    });
  }, []);


  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    storeSet(SIDEBAR_COLLAPSED_KEY, next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = accounts.map((a) => a.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    onReorder(next);
  };

  return (
    <nav className="mail-sidebar">
      <div className="mail-sidebar__toggle">
        <button
          type="button"
          className="mail-sidebar__toggle-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="mail-sidebar__accounts">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={accounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <ul className="mail-sidebar__list">
                {accounts.map((acc) => (
                  <AccountRowSortable
                    key={acc.id}
                    account={acc}
                    isActive={activeAccountId === acc.id}
                    isCollapsed={false}
                    onSelect={() => onSetActive(acc.id)}
                    onViewChange={onViewChange}
                    currentView={currentView}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {collapsed && (
        <ul className="mail-sidebar__list mail-sidebar__list--icons">
          {accounts.map((acc) => (
            <AccountRowSortable
              key={acc.id}
              account={acc}
              isActive={activeAccountId === acc.id}
              isCollapsed
              onSelect={() => onSetActive(acc.id)}
              onViewChange={onViewChange}
              currentView={currentView}
            />
          ))}
        </ul>
      )}

      <div className="mail-sidebar__bottom">
        <button type="button" className="mail-sidebar__bottom-btn" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={18} strokeWidth={1.5} />
          {!collapsed && <span>Settings</span>}
        </button>
        <button type="button" className="mail-sidebar__bottom-btn" onClick={onAddAccount} aria-label="Add account">
          <Plus size={18} strokeWidth={1.5} />
          {!collapsed && <span>Add account</span>}
        </button>
      </div>
    </nav>
  );
}

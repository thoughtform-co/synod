interface MailSidebarProps {
  activeLabel?: string;
  onChangeLabel?: (label: string) => void;
}

const LABELS = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'sent', name: 'Sent' },
  { id: 'drafts', name: 'Drafts' },
  { id: 'archive', name: 'Archive' },
];

export function MailSidebar({ activeLabel = 'inbox', onChangeLabel }: MailSidebarProps) {
  return (
    <nav className="label-nav">
      <ul className="label-nav__list">
        {LABELS.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              className={`label-nav__item ${activeLabel === l.id ? 'label-nav__item--active' : ''}`}
              onClick={() => onChangeLabel?.(l.id)}
            >
              {l.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

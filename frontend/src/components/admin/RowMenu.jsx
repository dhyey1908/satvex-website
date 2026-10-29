import { MoreHorizontal } from 'lucide-react';
import { usePopover } from './usePopover';
import './ui.css';

/**
 * The "⋯" menu at the end of a row / card.
 * items: [{ label, icon, onClick, danger, href, hidden }]
 */
export function RowMenu({ items, label = 'More actions' }) {
  const { open, setOpen, ref, placement } = usePopover();
  const visible = items.filter((i) => !i.hidden);
  return (
    <div className="ui-pop" ref={ref} data-no-row>
      <button
        type="button"
        className="ui-icon-btn"
        data-popover-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <div className="ui-pop-backdrop" />
          <div className={`ui-pop-panel ui-pop-panel-end ui-menu${placement}`} role="menu">
            {visible.map((item) => {
              const Icon = item.icon;
              const cls = `ui-menu-item ${item.danger ? 'is-danger' : ''}`;
              const inner = (
                <>
                  {Icon && <Icon size={15} aria-hidden="true" />} {item.label}
                </>
              );
              return item.href ? (
                <a key={item.label} role="menuitem" className={cls} href={item.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                  {inner}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

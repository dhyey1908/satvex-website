import { useEffect, useLayoutEffect, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { usePopover } from './usePopover';
import './ui.css';

const PHONE_MAX = 640; // the same width where CSS turns popovers into bottom sheets

/**
 * The "⋯" menu at the end of a row / card.
 * items: [{ label, icon, onClick, danger, href, hidden }]
 *
 * The table scrolls, and a scrolling box clips anything inside it, so on larger screens the
 * menu is placed against the screen (position: fixed) next to its button - flipped upward when
 * there is no room below - and closes if the page scrolls. Phones get the bottom sheet.
 */
export function RowMenu({ items, label = 'More actions' }) {
  const { open, setOpen, ref } = usePopover();
  const [style, setStyle] = useState(null);
  const visible = items.filter((i) => !i.hidden);

  useLayoutEffect(() => {
    if (!open || !ref.current || window.innerWidth <= PHONE_MAX) {
      setStyle(null);
      return;
    }
    const trigger = ref.current.querySelector('[data-popover-trigger]').getBoundingClientRect();
    const panel = ref.current.querySelector('.ui-pop-panel');
    const h = panel.offsetHeight;
    const w = panel.offsetWidth;
    let top = trigger.bottom + 6;
    if (top + h > window.innerHeight - 8 && trigger.top - h - 6 > 8) top = trigger.top - h - 6;
    const left = Math.min(Math.max(8, trigger.right - w), window.innerWidth - w - 8);
    setStyle({ position: 'fixed', top, left, right: 'auto', bottom: 'auto' });
  }, [open, ref]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, setOpen]);

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
          <div className="ui-pop-panel ui-pop-panel-end ui-menu" role="menu" style={style || undefined}>
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

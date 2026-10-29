import { ChevronDown, Check, X } from 'lucide-react';
import { usePopover } from './usePopover';
import './ui.css';

const toList = (value) => (value ? String(value).split(',').filter(Boolean) : []);

/**
 * A pill-shaped dropdown filter. `value` is '' (no filter) or, for a multi-select, a
 * comma-joined list ("Pending,Processing") — the same string the API takes.
 * options: [{ value, label, tone?, count? }]; `tone` paints the dot like its badge.
 */
export function FilterChip({ label, icon: Icon, options, value, onChange, multi = false }) {
  const { open, setOpen, ref, placement } = usePopover();
  const selected = toList(value);
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;
  const summary = selected.length === 0 ? 'All' : selected.length === 1 ? labelOf(selected[0]) : `${selected.length} selected`;

  function toggle(optionValue) {
    if (!multi) {
      onChange(selected[0] === optionValue ? '' : optionValue);
      setOpen(false);
      return;
    }
    const next = selected.includes(optionValue) ? selected.filter((v) => v !== optionValue) : [...selected, optionValue];
    onChange(next.join(','));
  }

  return (
    <div className="ui-pop" ref={ref}>
      <div className={`ui-chip ${selected.length ? 'is-set' : ''} ${open ? 'is-open' : ''}`}>
        <button
          type="button"
          className="ui-chip-main"
          data-popover-trigger
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {Icon && <Icon size={15} aria-hidden="true" />}
          <span className="ui-chip-label">{label}:</span>
          <strong>{summary}</strong>
          <ChevronDown size={14} aria-hidden="true" className="ui-chip-caret" />
        </button>
        {selected.length > 0 && (
          <button type="button" className="ui-chip-clear" aria-label={`Clear ${label} filter`} onClick={() => onChange('')}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="ui-pop-backdrop" onClick={() => setOpen(false)} />
          <div className={`ui-pop-panel ui-options${placement}`} role="listbox" aria-label={label} aria-multiselectable={multi}>
            <div className="ui-sheet-title">{label}</div>
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`ui-option ${on ? 'is-on' : ''}`}
                  onClick={() => toggle(o.value)}
                >
                  <span className={`ui-check ${multi ? 'is-box' : 'is-radio'} ${on ? 'is-on' : ''}`} aria-hidden="true">
                    {on && <Check size={11} />}
                  </span>
                  {o.tone && <span className={`ui-dot ui-dot-${o.tone}`} aria-hidden="true" />}
                  <span className="ui-option-label">{o.label}</span>
                  {typeof o.count === 'number' && <span className="ui-option-count">({o.count})</span>}
                </button>
              );
            })}
            {selected.length > 0 && (
              <button type="button" className="ui-option-clear" onClick={() => { onChange(''); setOpen(false); }}>
                Clear {label.toLowerCase()}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

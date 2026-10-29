import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { usePopover } from './usePopover';
import {
  MONTH_NAMES,
  addMonths,
  formatDay,
  formatRange,
  matchingPreset,
  monthGrid,
  presetRanges,
  startOfMonth,
  todayIST,
} from '../../utils/dateRange';
import './ui.css';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function Month({ month, from, to, hover, min, max, picking, onPick, onHover }) {
  const weeks = monthGrid(month);
  const [y, m] = month.split('-').map(Number);
  const today = todayIST();
  const end = to || (picking && hover && hover >= from ? hover : null);
  return (
    <div className="ui-month">
      <div className="ui-month-title">{MONTH_NAMES[m - 1]} {y}</div>
      <div className="ui-weekdays">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
      {weeks.map((week) => (
        <div className="ui-week" key={week[0].iso}>
          {week.map(({ iso, inMonth }) => {
            if (!inMonth) return <span key={iso} className="ui-day-blank" />;
            // The end can't be before the start: while picking the end, earlier days are off.
            const disabled = (min && iso < min) || (max && iso > max) || (picking && from && iso < from);
            const isStart = iso === from;
            const isEnd = iso === (to || end);
            const inBand = from && end && iso > from && iso < end;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-label={formatDay(iso)}
                aria-pressed={isStart || isEnd}
                className={[
                  'ui-day',
                  isStart || isEnd ? 'is-edge' : '',
                  isStart && end && end !== from ? 'is-start' : '',
                  isEnd && from && end !== from ? 'is-end' : '',
                  inBand ? 'is-band' : '',
                  iso === today ? 'is-today' : '',
                ].join(' ')}
                onClick={() => onPick(iso)}
                onMouseEnter={() => onHover(iso)}
              >
                {Number(iso.slice(8))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * One field that shows the chosen range ("12 Oct – 28 Oct 2026") and opens a calendar from
 * anywhere on it. Dates are YYYY-MM-DD in IST.
 *  - mode "range": value { from, to }, onChange({ from, to })  — presets + two months
 *  - mode "single": value is `from`, onChange({ from, to: from })
 */
export function DateRangePicker({ from = '', to = '', onChange, mode = 'range', min, max, label = 'Date', emptyText = 'Any date', fullWidth = false }) {
  const { open, setOpen, ref, flip } = usePopover();
  const single = mode === 'single';
  const today = todayIST();
  const [draft, setDraft] = useState({ from, to });
  const [month, setMonth] = useState(startOfMonth(from || today));
  const [hover, setHover] = useState(null);
  const picking = !single && Boolean(draft.from) && !draft.to;

  // Start from the applied value each time the calendar opens.
  useEffect(() => {
    if (open) {
      setDraft({ from, to });
      setMonth(startOfMonth(from || today));
      setHover(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(iso) {
    if (single) {
      setDraft({ from: iso, to: iso });
    } else if (!draft.from || draft.to) {
      setDraft({ from: iso, to: '' });
    } else {
      setDraft({ from: draft.from, to: iso });
    }
  }

  function apply(next = draft) {
    onChange?.({ from: next.from || '', to: next.to || next.from || '' });
    setOpen(false);
  }

  const activePreset = matchingPreset(draft.from, draft.to, today);
  const text = single ? (from ? formatDay(from) : emptyText) : formatRange(from, to, emptyText);
  const hasValue = Boolean(from || to);
  const canApply = single ? Boolean(draft.from) : Boolean(draft.from) && Boolean(draft.to || draft.from);

  return (
    <div className={`ui-pop ${fullWidth ? 'is-full' : ''}`} ref={ref}>
      <div className={`ui-chip ui-date ${hasValue ? 'is-set' : ''} ${open ? 'is-open' : ''}`}>
        <button
          type="button"
          className="ui-chip-main"
          data-popover-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${text}`}
          onClick={() => setOpen((v) => !v)}
        >
          <CalendarDays size={15} aria-hidden="true" />
          <span>{text}</span>
        </button>
        {hasValue && (
          <button type="button" className="ui-chip-clear" aria-label={`Clear ${label}`} onClick={() => onChange?.({ from: '', to: '' })}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="ui-pop-backdrop" onClick={() => setOpen(false)} />
          <div className={`ui-pop-panel ui-calendar ${single ? 'is-single' : ''} ${flip ? 'ui-pop-panel-end' : ''}`} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
            <div className="ui-sheet-title">{label}</div>
            <div className="ui-calendar-body">
              {!single && (
                <div className="ui-presets">
                  {presetRanges(today).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`ui-preset ${activePreset === p.id ? 'is-on' : ''}`}
                      onClick={() => {
                        setDraft({ from: p.from, to: p.to });
                        setMonth(startOfMonth(p.from));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button type="button" className={`ui-preset ${!activePreset && draft.from ? 'is-on' : ''}`} onClick={() => setDraft({ from: '', to: '' })}>
                    Custom
                  </button>
                </div>
              )}
              <div className="ui-calendars">
                <div className="ui-cal-nav">
                  <button type="button" className="ui-icon-btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" className="ui-icon-btn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="ui-months" onMouseLeave={() => setHover(null)}>
                  <Month month={month} from={draft.from} to={draft.to} hover={hover} min={min} max={max} picking={picking} onPick={pick} onHover={setHover} />
                  {!single && (
                    <div className="ui-month-second">
                      <Month month={addMonths(month, 1)} from={draft.from} to={draft.to} hover={hover} min={min} max={max} picking={picking} onPick={pick} onHover={setHover} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="ui-calendar-foot">
              <span className="ui-calendar-summary">
                {single ? formatDay(draft.from) : formatRange(draft.from, draft.to || (picking ? '' : draft.from), 'Pick a start date')}
                {picking && ' – pick an end date'}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => apply({ from: '', to: '' })}>
                Clear
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={() => apply()}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


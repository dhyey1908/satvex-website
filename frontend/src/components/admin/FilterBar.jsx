import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { FilterChip } from './FilterChip';
import { DateRangePicker } from './DateRangePicker';
import { formatRange } from '../../utils/dateRange';
import './ui.css';

function SearchBox({ value, onChange, placeholder, label }) {
  // The list hook debounces (300 ms), so typing here stays instant.
  return (
    <div className="ui-search">
      <Search size={16} aria-hidden="true" />
      <input type="text" value={value} placeholder={placeholder} aria-label={label} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="ui-search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * The filter row every admin list shares:
 *   [search] [chip ▾]… [date range] [More filters] [Clear all]
 * then the active filters as removable chips, and a "Showing 8 of 8 orders" line.
 *
 * chips: [{ key, label, icon, options, multi, secondary }]   secondary ones sit behind "More filters"
 * values: { [key]: string }   onChange(key, value)
 * date: { label, from, to, onChange({from,to}) }   (optional)
 */
export function FilterBar({ search, chips = [], values, onChange, date, onClearAll, resultText, searchLabel }) {
  const [showMore, setShowMore] = useState(false);
  const primary = chips.filter((c) => !c.secondary);
  const secondary = chips.filter((c) => c.secondary);
  const secondarySet = secondary.some((c) => values[c.key]);

  const active = [];
  for (const c of chips) {
    for (const v of String(values[c.key] || '').split(',').filter(Boolean)) {
      active.push({
        id: `${c.key}:${v}`,
        text: `${c.label}: ${c.options.find((o) => o.value === v)?.label ?? v}`,
        remove: () => onChange(c.key, String(values[c.key]).split(',').filter((x) => x && x !== v).join(',')),
      });
    }
  }
  // `isDefault`: the page's own opening range (e.g. last 30 days) is not a filter the admin chose.
  if (date && (date.from || date.to) && !date.isDefault) {
    active.push({ id: 'date', text: `${date.label}: ${formatRange(date.from, date.to)}`, remove: () => date.onChange({ from: '', to: '' }) });
  }
  if (search?.value) active.push({ id: 'search', text: `Search: “${search.value}”`, remove: () => search.onChange('') });

  const renderChip = (c) => <FilterChip key={c.key} label={c.label} icon={c.icon} options={c.options} multi={c.multi} value={values[c.key] || ''} onChange={(v) => onChange(c.key, v)} />;

  return (
    <div className="ui-filterbar">
      <div className="ui-filterbar-row">
        {search && <SearchBox value={search.value} onChange={search.onChange} placeholder={search.placeholder} label={searchLabel || search.placeholder} />}
        <div className="ui-filterbar-chips">
          {primary.map(renderChip)}
          {date && <DateRangePicker label={date.label} from={date.from} to={date.to} onChange={date.onChange} max={date.max} />}
          {secondary.length > 0 && (
            <button type="button" className={`ui-more ${secondarySet || showMore ? 'is-on' : ''}`} aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
              <SlidersHorizontal size={15} aria-hidden="true" /> More filters
            </button>
          )}
        </div>
        {active.length > 0 && (
          <button type="button" className="ui-clear-all" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>

      {secondary.length > 0 && (showMore || secondarySet) && <div className="ui-filterbar-more">{secondary.map(renderChip)}</div>}

      {active.length > 0 && (
        <ul className="ui-active" aria-label="Active filters">
          {active.map((a) => (
            <li key={a.id}>
              <span>{a.text}</span>
              <button type="button" aria-label={`Remove ${a.text}`} onClick={a.remove}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {resultText && (
        <p className="ui-result" aria-live="polite">
          {resultText}
        </p>
      )}
    </div>
  );
}

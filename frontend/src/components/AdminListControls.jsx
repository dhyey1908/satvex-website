import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Search, X } from 'lucide-react';

/**
 * Shared controls for the admin list screens (search box, sortable column
 * header, reset button). Kept in one place so every screen looks and behaves
 * the same; pair with the useAdminList hook.
 */

// Search box — an .input-shell (global.css), so it has one border and one
// focus ring like every other field. A clear (x) button appears once there's
// something to clear.
export function AdminSearchField({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <div className="input-shell admin-search">
      <Search size={16} aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
      />
      {value && (
        <button type="button" className="admin-search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// A <th> that sorts the list by `field`. `firstDir` is the direction used the
// first time the column is clicked (text asc, numbers/dates desc).
export function SortableTh({ label, field, sortBy, sortDir, onSort, firstDir = 'asc' }) {
  const active = sortBy === field;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`admin-sort-btn ${active ? 'active' : ''}`}
        onClick={() => onSort(field, firstDir)}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

export function ResetFiltersButton({ onClick, visible }) {
  if (!visible) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm admin-reset-filters" onClick={onClick}>
      <RotateCcw size={14} /> Reset Filters
    </button>
  );
}

// Labelled date input ("From" / "To").
export function DateFilter({ label, value, onChange, min, max }) {
  return (
    <label className="admin-date-filter text-label-sm">
      {label}
      <input type="date" value={value} min={min || undefined} max={max || undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// "Showing 12 of 87 orders" under the filters, plus a subtle refreshing hint.
export function ResultCount({ pagination, loading, label }) {
  if (!pagination) return null;
  return (
    <p className="admin-result-count" aria-live="polite">
      {pagination.total} {label}
      {loading ? ' · updating…' : ''}
    </p>
  );
}

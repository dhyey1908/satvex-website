import { ArrowDown, ArrowUp, ArrowUpDown, PackageOpen } from 'lucide-react';
import { Pagination } from '../Pagination';
import './ui.css';

const PAGE_SIZES = [10, 25, 50];
// Clicking these inside a row must not also "open" the row.
const INTERACTIVE = 'button, a, input, label, select, textarea, [data-no-row]';

/**
 * Shared admin table: sticky header, clickable rows, skeleton rows while loading, a friendly
 * empty state, and (on phones) every row turns into a card.
 *
 * columns: [{ key, header, render(row), sortField?, firstDir?, className?, label? }]
 *   `label` is the small caption shown beside the value on a phone card (default: header).
 * select: { selected: string[], onToggle(id), onToggleAll(rows) }  → adds a checkbox column
 */
export function DataTable({ columns, rows, rowKey, onRowClick, loading, sort, select, empty, rowClassName, caption }) {
  const initial = loading && !rows;
  const list = rows || [];
  const allOn = list.length > 0 && select && list.every((r) => select.selected.includes(rowKey(r)));

  if (!initial && list.length === 0 && empty) return empty;

  return (
    <div className={`ui-table-wrap ${loading && rows ? 'is-refreshing' : ''}`}>
      <table className="ui-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {select && (
              <th className="ui-col-select">
                <input type="checkbox" checked={allOn} onChange={() => select.onToggleAll(list)} aria-label="Select all rows on this page" />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.sortBy === c.sortField;
              const Icon = !active ? ArrowUpDown : sort.sortDir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} className={c.className} aria-sort={active ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortField && sort ? (
                    <button type="button" className={`ui-sort ${active ? 'is-on' : ''}`} onClick={() => sort.onSort(c.sortField, c.firstDir)}>
                      {c.header}
                      <Icon size={12} aria-hidden="true" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {initial
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="ui-skeleton-row" aria-hidden="true">
                  {select && <td className="ui-col-select" />}
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      <span className="ui-skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            : list.map((row) => {
                const id = rowKey(row);
                return (
                  <tr
                    key={id}
                    className={`${onRowClick ? 'is-clickable' : ''} ${select?.selected.includes(id) ? 'is-selected' : ''} ${rowClassName?.(row) || ''}`}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={(e) => onRowClick && !e.target.closest(INTERACTIVE) && onRowClick(row)}
                    onKeyDown={(e) => {
                      if (onRowClick && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }}
                  >
                    {select && (
                      <td className="ui-col-select" data-no-row>
                        <input type="checkbox" checked={select.selected.includes(id)} onChange={() => select.onToggle(id)} aria-label="Select row" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={c.className} data-label={c.label ?? c.header}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

/** Friendly "nothing here" block, with a Clear filters button when filters caused it. */
export function TableEmpty({ title, message, filtered, onClear, icon: Icon = PackageOpen }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {filtered && onClear && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Page numbers + "per page" choice (10 / 25 / 50). Pass the pieces useAdminList gives you. */
export function TableFooter({ paginationProps, pageSize, onPageSize, onPageChange, itemLabel }) {
  if (!paginationProps) return null;
  return (
    <div className="ui-table-footer">
      <label className="ui-pagesize">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <Pagination {...paginationProps} onPageChange={onPageChange || paginationProps.onPageChange} itemLabel={itemLabel} />
    </div>
  );
}

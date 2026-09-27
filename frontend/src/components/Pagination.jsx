import { ChevronLeft, ChevronRight } from 'lucide-react';
import './Pagination.css';

/**
 * Shared pagination control — used across every admin table and
 * customer-facing list in the app so the pattern (and its markup/CSS) stays
 * in exactly one place. Pair with the usePagination hook.
 */
function pageWindow(page, totalPages) {
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

export function Pagination({ page, totalPages, onPageChange, total, rangeStart, rangeEnd, itemLabel = 'items' }) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);

  return (
    <div className="pagination">
      {typeof total === 'number' && (
        <p className="pagination-summary">
          Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{total}</strong> {itemLabel}
        </p>
      )}
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-ghost btn-sm pagination-nav"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} /> <span className="pagination-nav-label">Previous</span>
        </button>

        <div className="pagination-pages">
          {pages[0] > 1 && (
            <>
              <button type="button" className="pagination-page" onClick={() => onPageChange(1)}>1</button>
              {pages[0] > 2 && <span className="pagination-ellipsis">…</span>}
            </>
          )}
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              className={`pagination-page ${p === page ? 'active' : ''}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span className="pagination-ellipsis">…</span>}
              <button type="button" className="pagination-page" onClick={() => onPageChange(totalPages)}>{totalPages}</button>
            </>
          )}
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm pagination-nav"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <span className="pagination-nav-label">Next</span> <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

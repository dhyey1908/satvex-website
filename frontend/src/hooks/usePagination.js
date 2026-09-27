import { useState } from 'react';

/**
 * Client-side pagination over an already-filtered array. Every list in this
 * app is small enough that the backend returns the full set in one call
 * (no endpoint here supports page/cursor query params), so pagination is
 * just slicing that array — this hook is the one place that logic lives.
 *
 * `page` is automatically clamped to the valid range, so if a search/filter
 * shrinks the result set out from under a high page number, rendering
 * naturally falls back to the last valid page instead of showing nothing.
 */
export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const list = items || [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  return {
    page: safePage,
    setPage,
    totalPages,
    pageItems,
    total: list.length,
    pageSize,
    rangeStart: list.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, list.length),
  };
}

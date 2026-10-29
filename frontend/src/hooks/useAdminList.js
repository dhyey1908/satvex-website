import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * State + data loading for an admin list screen whose search, filters, sort
 * and pagination are all done by the BACKEND (see adminListQueries.js), so
 * every control applies to the full record set — never just the page that
 * happens to be loaded.
 *
 * - `fetcher(params)` -> response object; `resultKey` names the array in it.
 * - `filters` holds every non-search filter ('' = no filter).
 * - Changing search / a filter / the sort resets to page 1.
 * - Previous results stay on screen while a new request is in flight, so the
 *   filter bar (and a focused search box) never unmounts mid-typing.
 * - Out-of-order responses are discarded.
 * - `urlSync`: search, filters, sort, page and page size live in the query string
 *   (?q=&status=Pending&sort=…&page=2&size=25), so a refresh or a shared link keeps them.
 */
export function useAdminList({ fetcher, resultKey, defaults, pageSize: initialPageSize = 20, urlSync = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = (key) => (urlSync ? searchParams.get(key) : null);
  const defaultFilters = useMemo(() => defaults.filters || {}, [defaults.filters]);
  const [filters, setFilters] = useState(() => {
    const out = { ...defaultFilters };
    for (const key of Object.keys(defaultFilters)) {
      const v = fromUrl(key);
      if (v) out[key] = v;
    }
    return out;
  });
  const [searchInput, setSearchInput] = useState(() => fromUrl('q') || '');
  const [search, setSearch] = useState(() => (fromUrl('q') || '').trim());
  const [sortBy, setSortBy] = useState(() => fromUrl('sort') || defaults.sortBy);
  const [sortDir, setSortDir] = useState(() => fromUrl('dir') || defaults.sortDir);
  const [page, setPage] = useState(() => Math.max(1, Number(fromUrl('page')) || 1));
  const [pageSize, setPageSizeState] = useState(() => Number(fromUrl('size')) || initialPageSize);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latest = useRef(0);

  // Debounce the text box; everything else applies immediately.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((prev) => {
        const next = searchInput.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params = useMemo(() => {
    const out = { sortBy, sortDir, page, pageSize };
    if (search) out.search = search;
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '' && value != null) out[key] = value;
    }
    return out;
  }, [filters, search, sortBy, sortDir, page, pageSize]);

  const paramsKey = JSON.stringify(params);

  // Mirror the state into the address bar (replace, so Back still leaves the page).
  useEffect(() => {
    if (!urlSync) return;
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== (defaultFilters[key] ?? '')) next.set(key, value);
    }
    if (sortBy !== defaults.sortBy) next.set('sort', sortBy);
    if (sortDir !== defaults.sortDir) next.set('dir', sortDir);
    if (page > 1) next.set('page', String(page));
    if (pageSize !== initialPageSize) next.set('size', String(pageSize));
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true, state: { keepScroll: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSync, search, filters, sortBy, sortDir, page, pageSize]);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const requestId = latest.current + 1;
    latest.current = requestId;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcherRef
      .current(JSON.parse(paramsKey))
      .then((data) => {
        if (latest.current === requestId) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (latest.current === requestId) {
          setState((prev) => ({ ...prev, loading: false, error: err.message || 'Something went wrong.' }));
        }
      });
  }, [paramsKey, reloadToken]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const toggleSort = useCallback(
    (field, firstDir = 'asc') => {
      if (field === sortBy) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir(firstDir);
      }
      setPage(1);
    },
    [sortBy]
  );

  const reset = useCallback(() => {
    setFilters(defaultFilters);
    setSearchInput('');
    setSearch('');
    setSortBy(defaults.sortBy);
    setSortDir(defaults.sortDir);
    setPage(1);
  }, [defaultFilters, defaults.sortBy, defaults.sortDir]);

  // Clears search + filters but keeps the sort the admin chose.
  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setSearchInput('');
    setSearch('');
    setPage(1);
  }, [defaultFilters]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const setPageSize = useCallback((n) => {
    setPageSizeState(n);
    setPage(1);
  }, []);

  // Everything matching the current search/filters/sort (no paging) — used by
  // the CSV export so it isn't limited to the visible page.
  const fetchAll = useCallback(async () => {
    const { page: _p, pageSize: _s, ...rest } = JSON.parse(paramsKey);
    const data = await fetcherRef.current(rest);
    return data[resultKey] || [];
  }, [paramsKey, resultKey]);

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    Object.entries(filters).some(([key, value]) => value !== (defaultFilters[key] ?? '')) ||
    sortBy !== defaults.sortBy ||
    sortDir !== defaults.sortDir;

  const data = state.data;
  const pagination = data?.pagination || null;

  return {
    items: data ? data[resultKey] || [] : null,
    pagination,
    facets: data?.facets || {},
    data,
    loading: state.loading,
    error: state.error,
    filters,
    setFilter,
    searchInput,
    setSearchInput,
    sortBy,
    sortDir,
    toggleSort,
    page: pagination?.page || page,
    setPage,
    reset,
    clearFilters,
    pageSize,
    setPageSize,
    reload,
    fetchAll,
    hasActiveFilters,
    // Props for <Pagination />.
    paginationProps: pagination
      ? {
          page: pagination.page,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
          total: pagination.total,
          rangeStart: pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1,
          rangeEnd: Math.min(pagination.page * pagination.pageSize, pagination.total),
        }
      : null,
  };
}

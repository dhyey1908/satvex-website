import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 350;

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
 */
export function useAdminList({ fetcher, resultKey, defaults, pageSize = 20 }) {
  const defaultFilters = useMemo(() => defaults.filters || {}, [defaults.filters]);
  const [filters, setFilters] = useState(defaultFilters);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(defaults.sortBy);
  const [sortDir, setSortDir] = useState(defaults.sortDir);
  const [page, setPage] = useState(1);
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

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

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

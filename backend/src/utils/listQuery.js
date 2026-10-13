const { z } = require('zod');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Shared building blocks for the admin list screens. Every admin list is
// filtered, sorted and paginated HERE — over the complete result set — so a
// sort/filter always applies to all records, never only to the page the
// browser happens to have loaded.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// Query-string params arrive as strings and may be empty — '' means "no filter".
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());
const withDefault = (schema, value) => z.preprocess(blankToUndefined, schema.default(value));

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

// The sort / search / pagination params every list shares.
function listShape({ sortFields, defaultSort, defaultDir = 'desc' }) {
  return {
    search: optional(z.string().trim().max(100)),
    sortBy: withDefault(z.enum(sortFields), defaultSort),
    sortDir: withDefault(z.enum(['asc', 'desc']), defaultDir),
    // No `page` = legacy "give me everything" call (kept so existing callers,
    // e.g. the contact detail lookup, are unaffected).
    page: optional(z.coerce.number().int().min(1)),
    pageSize: withDefault(z.coerce.number().int().min(1).max(MAX_PAGE_SIZE), DEFAULT_PAGE_SIZE),
  };
}

const dateRangeShape = {
  dateFrom: optional(isoDay),
  dateTo: optional(isoDay),
};

function checkDateRange(q) {
  return !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo;
}
const DATE_RANGE_ERROR = { message: '"From" date must not be after "To" date.', path: ['dateTo'] };

// Which calendar day (IST) an ISO timestamp falls on — the store operates in
// India, so an order placed at 1am IST belongs to that IST day, not the
// previous UTC one. Matches the Financial Analytics screen.
function istDay(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function inDateRange(iso, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const day = istDay(iso);
  if (!day) return false;
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

// Case-insensitive "any of these fields contains the term".
function matchesSearch(term, fields) {
  if (!term) return true;
  const needle = String(term).trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(needle));
}

function isBlank(v) {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

// Stable sort by `accessor(item)`. Missing values always sort LAST (in both
// directions) so e.g. "coupon expiry, soonest first" doesn't open with a wall
// of coupons that have no expiry. `tieBreak` keeps equal keys deterministic.
function sortItems(items, accessor, dir = 'asc', tieBreak = null) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((x, y) => {
    const a = accessor(x);
    const b = accessor(y);
    const aBlank = isBlank(a);
    const bBlank = isBlank(b);
    if (!aBlank || !bBlank) {
      if (aBlank) return 1;
      if (bBlank) return -1;
      const c = compareValues(a, b) * sign;
      if (c !== 0) return c;
    }
    return tieBreak ? tieBreak(x, y) : 0;
  });
}

// Newest-first by createdAt — the tie-break every list uses.
function newestFirst(x, y) {
  const a = x.createdAt || '';
  const b = y.createdAt || '';
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

// `page` undefined => no pagination (everything, one page).
function paginate(items, { page, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const total = items.length;
  if (!page) {
    return { items, pagination: { page: 1, pageSize: total, total, totalPages: 1 } };
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: safePage, pageSize, total, totalPages },
  };
}

// Full paginated Scan. A single Scan stops at 1 MB, which would silently
// truncate any list past that size.
async function scanAll(docClient, tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await docClient.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

module.exports = {
  z,
  optional,
  withDefault,
  isoDay,
  listShape,
  dateRangeShape,
  checkDateRange,
  DATE_RANGE_ERROR,
  istDay,
  inDateRange,
  matchesSearch,
  sortItems,
  newestFirst,
  paginate,
  scanAll,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
};

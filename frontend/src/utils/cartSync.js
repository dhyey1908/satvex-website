// Pure helpers behind CartContext, kept separate so they can be tested without React.

// A UUID for one "add to bag" click. The server uses it as the line's id, so the same request can never add the
// line twice (double click, a retry after a dropped connection, a re-sent request).
export function newRequestId() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The same selection clicked again while the first is still being added is ONE intent (product, pack, colours).
export function intentKey({ productId, sellingOptionId, selectedColors = [] }) {
  return [productId, sellingOptionId, [...selectedColors].sort().join(',')].join('|');
}

// The bag count shown everywhere: the sum of the quantities of the items in the bag (a Combo of 3 x 2 is 2 bag
// items - never 6 pieces, never 1 line). `pending` is the quantity of adds still in flight (the optimistic bump).
export function bagCount(items, pending = 0) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) + pending;
}

// Several requests can be in flight at once and finish in any order. Each gets a sequence number when it STARTS;
// a response is applied only if nothing that started later has already been applied.
export function createSequencer() {
  let started = 0;
  let applied = 0;
  return {
    start: () => ++started,
    // true = apply this response; false = it is stale, ignore it
    accept(seq) {
      if (seq < applied) return false;
      applied = seq;
      return true;
    },
    reset() {
      started = 0;
      applied = 0;
    },
  };
}

// Calendar-day helpers for the admin date pickers. Days are plain "YYYY-MM-DD" strings in
// IST (the store's timezone) and all arithmetic is done in UTC, so the browser's own
// timezone can never shift a day.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
const fromParts = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based
const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
};

export const todayIST = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);

export function addDays(iso, n) {
  const { y, m, d } = parse(iso);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
}

export const startOfMonth = (iso) => `${iso.slice(0, 8)}01`;
export function endOfMonth(iso) {
  const { y, m } = parse(iso);
  return fromParts(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
}
export function addMonths(iso, n) {
  const { y, m } = parse(iso);
  return fromParts(new Date(Date.UTC(y, m + n, 1)).getUTCFullYear(), new Date(Date.UTC(y, m + n, 1)).getUTCMonth(), 1);
}

/** The quick ranges offered in the picker, relative to `today`. */
export function presetRanges(today) {
  const lastMonthStart = startOfMonth(addDays(startOfMonth(today), -1));
  return [
    { id: 'today', label: 'Today', from: today, to: today },
    { id: 'yesterday', label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { id: 'last7', label: 'Last 7 days', from: addDays(today, -6), to: today },
    { id: 'last30', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { id: 'thisMonth', label: 'This month', from: startOfMonth(today), to: today },
    { id: 'lastMonth', label: 'Last month', from: lastMonthStart, to: endOfMonth(lastMonthStart) },
  ];
}

/** 28 Oct 2026 */
export function formatDay(iso) {
  if (!iso) return '';
  const { y, m, d } = parse(iso);
  return `${pad(d)} ${MONTHS[m]} ${y}`;
}

/** "12 Oct – 28 Oct 2026", "28 Oct 2026", "From 12 Oct 2026", or the empty text. */
export function formatRange(from, to, empty = 'Any date') {
  if (!from && !to) return empty;
  if (from && !to) return `From ${formatDay(from)}`;
  if (!from && to) return `Until ${formatDay(to)}`;
  if (from === to) return formatDay(from);
  const a = parse(from);
  const b = parse(to);
  const left = a.y === b.y ? `${pad(a.d)} ${MONTHS[a.m]}` : formatDay(from);
  return `${left} – ${formatDay(to)}`;
}

/** Weeks (Mon–Sun) of the month containing `iso`: [{ iso, inMonth }[]]. */
export function monthGrid(iso) {
  const { y, m } = parse(iso);
  const first = fromParts(y, m, 1);
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const weeks = [];
  let cursor = addDays(first, -lead);
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ iso: cursor, inMonth: cursor.slice(0, 7) === first.slice(0, 7) });
      cursor = addDays(cursor, 1);
    }
    if (w >= 4 && !week.some((c) => c.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

/** Which preset (if any) matches this exact range — so the picker can highlight it. */
export const matchingPreset = (from, to, today) => presetRanges(today).find((p) => p.from === from && p.to === to)?.id || null;

/** "28 Oct, 2:15 PM" in IST, from an ISO timestamp. */
export function formatShortDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

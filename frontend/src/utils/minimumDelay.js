// Timing rules shared by every loader so they behave the same way:
//  - a loader is only worth showing once it has been needed for GRACE_MS
//    (a response that comes back in 100 ms never flashes anything), and
//  - once it has been shown it stays for MIN_VISIBLE_MS so it reads as a
//    deliberate animation instead of a flicker.
// Neither number ever delays work: they only decide how long the loader
// lingers AFTER the real operation has already finished.
export const GRACE_MS = 150;
export const MIN_VISIBLE_MS = 800;
// Critical actions (placing an order, retrying a payment) hold a touch longer.
export const MIN_ACTION_MS = 900;

// How much longer a loader that became visible at `shownAt` must stay up.
export function remainingMs(shownAt, min = MIN_VISIBLE_MS, now = Date.now()) {
  if (shownAt == null) return 0;
  return Math.max(0, min - (now - shownAt));
}

// Resolves once at least `min` ms have passed since `startedAt`. Await it on
// the SUCCESS path of an action only; error paths must clear the loader at
// once, never wait.
export function waitForMinimum(startedAt, min = MIN_ACTION_MS, { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const wait = remainingMs(startedAt, min, now());
  return wait > 0 ? sleep(wait) : Promise.resolve();
}

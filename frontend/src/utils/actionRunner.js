import { MIN_ACTION_MS, waitForMinimum } from './minimumDelay.js';

// Core of the critical-action loader (see context/ActionLoaderContext.jsx),
// kept free of React so its rules can be tested directly:
//  - the loader is shown the moment the action starts and is never hidden
//    before the action has actually finished;
//  - on SUCCESS it is held to `min` ms; on ERROR it is hidden at once and the
//    error is rethrown;
//  - a second call with the same key while the first is running joins it (same
//    promise) instead of starting another request - no double submissions;
//  - `keepOpen(result)` true leaves the loader up (the browser is about to
//    navigate away, e.g. to PayU).
export function createActionRunner({ show, hide, wait = waitForMinimum, now = Date.now }) {
  const inFlight = new Map();

  return function runAction(key, fn, { label = 'Please wait…', min = MIN_ACTION_MS, keepOpen } = {}) {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const startedAt = now();
    show({ key, label });

    const promise = (async () => {
      try {
        const result = await fn();
        if (keepOpen?.(result)) return result;
        await wait(startedAt, min);
        hide(key);
        return result;
      } catch (err) {
        hide(key);
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  };
}

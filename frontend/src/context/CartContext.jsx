import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cartService } from '../services/cartService';
import { couponService } from '../services/couponService';
import { useAuth } from './AuthContext';
import { bagCount, createSequencer, intentKey, newRequestId } from '../utils/cartSync';
import { reportError } from '../utils/reportError';

const CartContext = createContext(null);

const EMPTY = { items: [], savedItems: [], total: 0 };
const CHANNEL = 'satvex-cart';
const PING_KEY = 'satvex_cart_ping';
const STALE_AFTER_MS = 3000; // coming back to the tab refetches unless the bag was read this recently

/**
 * THE one source of truth for the bag on the client. The header badge, the product page, quick-add buttons, the
 * bag page and checkout all read this one store.
 *
 * How it stays right without a page refresh:
 *  - The server is the authority: every change (add / update / remove / save for later) answers with the WHOLE
 *    updated cart, and this store REPLACES its copy with it (no second request, nothing half-updated).
 *  - Requests get a sequence number when they start; a response that finished late (older than one already
 *    applied) is ignored. A refetch that overlaps a change is thrown away and redone, so it can never put an older
 *    cart over a newer one.
 *  - "Add" is idempotent (a request id per click) and a repeated click on the same selection while it is being
 *    added is the same add - so it lands once. The badge goes up at once (optimistic) and is corrected by the
 *    server's answer; if the add fails it goes back down.
 *  - Nothing here depends on a render's `isAuthenticated`: an add that resumes after the login popup is the same
 *    stable function, so it can no longer wipe the cart with a stale "logged out" view.
 *  - The bag is read again when the tab regains focus / becomes visible / is restored from the back-forward cache,
 *    and other tabs are told (BroadcastChannel, with a localStorage fallback) to read it after any change.
 * "Buy Now" never touches this store (it has its own one-item checkout session).
 */
export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  // Quantity of adds still on their way: shown in the badge at once, then replaced by the server's real answer.
  const [pendingAdds, setPendingAdds] = useState(0);
  // Applied coupon lives only in memory (not persisted) - re-validated authoritatively server-side at checkout,
  // so a stale/lost value here is never a trust issue, just a UX convenience carried from Cart to Checkout.
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  const authRef = useRef(isAuthenticated);
  authRef.current = isAuthenticated;
  const sequencer = useRef(createSequencer());
  const inflightChanges = useRef(0); // changes (add/update/remove) currently being sent
  const settledChanges = useRef(0); // how many changes have finished (a read compares it before / after)
  const needsRefetch = useRef(false); // a refetch was thrown away because it overlapped a change
  const lastReadAt = useRef(0);
  const addsInFlight = useRef(new Map()); // intent -> the promise of the add already on its way
  const channelRef = useRef(null);

  // ---- telling the other tabs --------------------------------------------------------------------------
  const announce = useCallback(() => {
    try {
      channelRef.current?.postMessage('changed');
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(PING_KEY, String(Date.now())); // fallback for browsers without BroadcastChannel
    } catch {
      // storage unavailable
    }
  }, []);

  // ---- reading & replacing the cart -------------------------------------------------------------------
  const applyCart = useCallback((data) => {
    setCart({ items: data.items || [], savedItems: data.savedItems || [], total: data.total ?? 0 });
  }, []);

  const refresh = useCallback(async () => {
    if (!authRef.current) {
      sequencer.current.reset();
      setCart(EMPTY);
      return;
    }
    setLoading(true);
    try {
      // A read that overlaps a change may have been answered before that change landed. Such an answer is never
      // applied: while a change is still being sent it waits for the change's own (newest) answer, and if a change
      // settled during the read it simply reads again.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const changesSettledAtStart = settledChanges.current;
        const seq = sequencer.current.start();
        const data = await cartService.get();
        lastReadAt.current = Date.now();
        if (inflightChanges.current > 0) {
          needsRefetch.current = true;
          return;
        }
        if (!authRef.current) return; // logged out while reading
        if (settledChanges.current !== changesSettledAtStart) continue;
        if (sequencer.current.accept(seq)) applyCart(data);
        return;
      }
    } catch (err) {
      // Keep what we have, and make it visible instead of failing silently.
      reportError('cart-refresh', err);
    } finally {
      setLoading(false);
    }
  }, [applyCart]);

  // Runs one change against the server and replaces the cart with the answer.
  const runChange = useCallback(
    async (area, send) => {
      inflightChanges.current += 1;
      const seq = sequencer.current.start();
      try {
        const data = await send();
        if (sequencer.current.accept(seq)) applyCart(data);
        lastReadAt.current = Date.now();
        announce();
        return data;
      } catch (err) {
        reportError(`cart-${area}`, err);
        throw err;
      } finally {
        inflightChanges.current -= 1;
        settledChanges.current += 1;
        if (inflightChanges.current === 0 && needsRefetch.current) {
          needsRefetch.current = false;
          refresh();
        }
      }
    },
    [applyCart, announce, refresh]
  );

  // ---- the mutations (all stable: they never close over a stale login state) ---------------------------
  const addItem = useCallback(
    (payload) => {
      const key = intentKey(payload);
      const running = addsInFlight.current.get(key);
      if (running) return running; // the same click again while it is being added = the same add

      const quantity = payload.quantity || 1;
      setPendingAdds((n) => n + quantity); // the badge goes up straight away
      const requestId = newRequestId();
      const promise = (async () => {
        try {
          const data = await runChange('add', () => cartService.add({ ...payload, requestId }));
          return data.item;
        } finally {
          // Success: the real cart is already in place. Failure: the badge drops back (rollback).
          setPendingAdds((n) => Math.max(0, n - quantity));
          addsInFlight.current.delete(key);
        }
      })();
      addsInFlight.current.set(key, promise);
      return promise;
    },
    [runChange]
  );

  const updateItem = useCallback((cartItemId, payload) => runChange('update', () => cartService.update(cartItemId, payload)), [runChange]);
  const removeItem = useCallback((cartItemId) => runChange('remove', () => cartService.remove(cartItemId)), [runChange]);
  const setSavedForLater = useCallback(
    (cartItemId, savedForLater) => runChange('save-for-later', () => cartService.setSavedForLater(cartItemId, savedForLater)),
    [runChange]
  );

  // ---- login / logout ---------------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated) refresh();
    else {
      sequencer.current.reset();
      addsInFlight.current.clear();
      setPendingAdds(0);
      setCart(EMPTY);
    }
  }, [isAuthenticated, refresh]);

  // ---- coming back to the page, and the other tabs ------------------------------------------------------
  useEffect(() => {
    const readAgain = (force) => {
      if (!authRef.current || inflightChanges.current > 0) return;
      if (!force && Date.now() - lastReadAt.current < STALE_AFTER_MS) return;
      refresh();
    };
    const onFocus = () => readAgain(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') readAgain(false);
    };
    // Restored from the back/forward cache: the page is exactly as it was left, so its bag may be old.
    const onPageShow = (event) => {
      if (event.persisted) readAgain(true);
    };
    const onStorage = (event) => {
      if (event.key === PING_KEY) readAgain(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('storage', onStorage);

    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => readAgain(true);
      channelRef.current = channel;
    }
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('storage', onStorage);
      channel?.close();
      channelRef.current = null;
    };
  }, [refresh]);

  // ---- coupon (kept in memory only) ---------------------------------------------------------------------
  const applyCoupon = useCallback(async (code) => {
    const result = await couponService.apply(code);
    setAppliedCoupon(result);
    return result;
  }, []);

  const clearCoupon = useCallback(() => setAppliedCoupon(null), []);

  // Exact-variant match (same product, same selling option, same color set regardless of pick order) - used to
  // switch "Add to Cart" to "Go to Cart" only when this specific combination is already in the bag, so a customer
  // can still add a different color/combo of the same product.
  const { items } = cart;
  const isInCart = useCallback(
    (productId, sellingOptionId, selectedColors = []) => {
      const target = [...selectedColors].sort().join(',');
      return items.some(
        (item) =>
          item.productId === productId &&
          item.sellingOptionId === sellingOptionId &&
          [...(item.selectedColors || [])].sort().join(',') === target
      );
    },
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      savedItems: cart.savedItems,
      total: cart.total,
      // The bag count, the same number everywhere: the sum of the quantities (a Combo of 3 x 2 = 2).
      itemCount: bagCount(items, pendingAdds),
      lineCount: items.length,
      loading,
      appliedCoupon,
      refresh,
      addItem,
      updateItem,
      removeItem,
      setSavedForLater,
      applyCoupon,
      clearCoupon,
      isInCart,
    }),
    [items, cart.savedItems, cart.total, pendingAdds, loading, appliedCoupon, refresh, addItem, updateItem, removeItem, setSavedForLater, applyCoupon, clearCoupon, isInCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { cartService } from '../services/cartService';
import { couponService } from '../services/couponService';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // Applied coupon lives only in memory (not persisted) — re-validated
  // authoritatively server-side at checkout, so a stale/lost value here is
  // never a trust issue, just a UX convenience carried from Cart to Checkout.
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setSavedItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const data = await cartService.get();
      setItems(data.items);
      setSavedItems(data.savedItems || []);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (payload) => {
      const { item } = await cartService.add(payload);
      await refresh();
      return item;
    },
    [refresh]
  );

  const updateItem = useCallback(
    async (cartItemId, payload) => {
      await cartService.update(cartItemId, payload);
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (cartItemId) => {
      await cartService.remove(cartItemId);
      await refresh();
    },
    [refresh]
  );

  const setSavedForLater = useCallback(
    async (cartItemId, savedForLater) => {
      await cartService.setSavedForLater(cartItemId, savedForLater);
      await refresh();
    },
    [refresh]
  );

  const applyCoupon = useCallback(async (code) => {
    const result = await couponService.apply(code);
    setAppliedCoupon(result);
    return result;
  }, []);

  const clearCoupon = useCallback(() => setAppliedCoupon(null), []);

  // Exact-variant match (same product, same selling option, same color set
  // regardless of pick order) — used to switch "Add to Cart" to "Go to
  // Cart" only when this specific combination is already in the bag, so a
  // customer can still add a different color/combo of the same product.
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

  const value = {
    items,
    savedItems,
    total,
    itemCount: items.length,
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
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

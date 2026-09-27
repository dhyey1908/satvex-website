import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { wishlistService } from '../services/wishlistService';
import { useAuth } from './AuthContext';

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await wishlistService.get();
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (productId) => {
      await wishlistService.add(productId);
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (productId) => {
      await wishlistService.remove(productId);
      await refresh();
    },
    [refresh]
  );

  const productIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);
  const isInWishlist = useCallback((productId) => productIds.has(productId), [productIds]);

  const value = { items, itemCount: items.length, loading, refresh, addItem, removeItem, isInWishlist };

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}

import { useEffect, useState } from 'react';
import { couponService } from '../services/couponService';

/**
 * The one-tap coupon chips for the bag and checkout. They come from the admin (Coupons > "Show as a quick-apply
 * chip"), so a coupon that is switched off, expired or used up simply is not in the list. Failing to load just
 * means no chips; the code box still works.
 */
export function useCouponChips() {
  const [chips, setChips] = useState([]);
  useEffect(() => {
    let cancelled = false;
    couponService
      .chips()
      .then((data) => {
        if (!cancelled) setChips((data.chips || []).map((c) => c.code));
      })
      .catch(() => {
        if (!cancelled) setChips([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return chips;
}

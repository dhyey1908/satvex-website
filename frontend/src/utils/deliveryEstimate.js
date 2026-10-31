import { STOREFRONT } from '../config/storefront.js';

// "3 Nov - 10 Nov": today + dispatch days to today + dispatch + transit days.
// The days come from the admin (Settings > Checkout > Shipping), falling back to
// STOREFRONT.delivery until they are set. A plain estimate, never a guaranteed
// date and never per-pincode data.
export function deliveryDays(shipping) {
  const pick = (value, fallback) => (Number.isFinite(value) && value >= 0 ? value : fallback);
  return {
    dispatchDays: pick(shipping?.dispatchDays, STOREFRONT.delivery.dispatchDays),
    transitDays: pick(shipping?.transitDays, STOREFRONT.delivery.transitDays),
  };
}

// "Thu, 5 Nov" for a YYYY-MM-DD delivery date the server worked out for a pincode.
export function formatDeliveryDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function estimateWindow(shipping, now = new Date()) {
  const { dispatchDays, transitDays } = deliveryDays(shipping);
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const from = new Date(now);
  from.setDate(from.getDate() + dispatchDays);
  const to = new Date(now);
  to.setDate(to.getDate() + dispatchDays + transitDays);
  return `${fmt(from)} – ${fmt(to)}`;
}

import { STOREFRONT } from '../config/storefront';

// "3 Nov - 10 Nov": today + dispatch days to today + dispatch + transit days.
// A plain estimate from STOREFRONT.delivery (TODO(confirm) the real numbers
// there), never a guaranteed date and never per-pincode data.
export function estimateWindow() {
  const { dispatchDays, transitDays } = STOREFRONT.delivery;
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const from = new Date();
  from.setDate(from.getDate() + dispatchDays);
  const to = new Date();
  to.setDate(to.getDate() + dispatchDays + transitDays);
  return `${fmt(from)} – ${fmt(to)}`;
}

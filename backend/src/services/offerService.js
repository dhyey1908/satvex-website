const settingsService = require('./settingsService');
const { validateCoupon } = require('./pricingService');

const money = (n) => Number(Number(n).toFixed(2));

/**
 * Display-only offer figures for each selling option, worked out here so the
 * browser never does price math. Nothing here feeds checkout — the real
 * totals still come from pricingService.calculateTotals.
 *
 *  - perPiece: price / pieces in the pack.
 *  - saveAmount: the admin's compareAtPrice minus price when set, otherwise
 *    (single-piece price x pieces) minus price for a combo; 0 when nothing is
 *    actually saved.
 *  - freeQuantity / paidQuantity / freeLabel: for a "buy 3, get 1 free" pack (4 pieces, 1 free)
 *    the label shoppers see, e.g. "Buy 3, get 1 free"; absent when nothing is free.
 *  - couponCode / priceAfterCoupon: only when a live coupon (the active
 *    announcement's code) really applies to this pack's price.
 */
async function decorateOptions(product, couponCode) {
  const single = (product.sellingOptions || []).find((o) => o.quantity === 1 && o.isActive);
  const options = [];
  for (const option of product.sellingOptions || []) {
    const compareAt = option.compareAtPrice > option.price ? option.compareAtPrice - option.price : 0;
    const singleEquivalent = single && option.quantity > 1 ? single.price * option.quantity - option.price : 0;
    const saveAmount = money(compareAt || Math.max(singleEquivalent, 0));

    let coupon = null;
    if (couponCode) {
      try {
        const result = await validateCoupon(couponCode, option.price);
        if (result.discountAmount > 0 && option.price - result.discountAmount > 0) {
          coupon = { couponCode: result.code, priceAfterCoupon: money(option.price - result.discountAmount) };
        }
      } catch {
        coupon = null; // invalid / expired / exhausted — show nothing
      }
    }

    const free = Number(option.freeQuantity) > 0 && option.freeQuantity < option.quantity ? Number(option.freeQuantity) : 0;
    const freeOffer = free ? { freeQuantity: free, paidQuantity: option.quantity - free, freeLabel: `Buy ${option.quantity - free}, get ${free} free` } : {};

    options.push({
      ...option,
      offer: { perPiece: money(option.price / (option.quantity || 1)), saveAmount, ...freeOffer, ...(coupon || {}) },
    });
  }
  return { ...product, sellingOptions: options };
}

// The code the storefront is currently promoting: the first active
// announcement that references a coupon (already filtered for validity).
async function getPromotedCouponCode() {
  const settings = await settingsService.getSettings();
  const active = await settingsService.getActiveAnnouncements(settings.announcements);
  return active.find((a) => a.couponCode)?.couponCode || null;
}

async function decorateProducts(products) {
  const code = await getPromotedCouponCode();
  return Promise.all(products.map((p) => decorateOptions(p, code)));
}

module.exports = { decorateOptions, decorateProducts, getPromotedCouponCode };

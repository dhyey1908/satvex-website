// expired beats everything (checkout rejects it regardless); exhausted = usage limit reached; otherwise the
// admin's own active toggle. Shared by the admin list and the quick-apply chips on the storefront.
function couponStatus(coupon, now = Date.now()) {
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return 'expired';
  if (coupon.usageLimit && (coupon.usageCount || 0) >= coupon.usageLimit) return 'exhausted';
  return coupon.isActive ? 'active' : 'inactive';
}

// The coupons to offer as one-tap chips on the bag and checkout: switched on for chips by the admin AND still usable.
function chipCoupons(coupons, now = Date.now()) {
  return coupons
    .filter((c) => c.showAsChip === true && couponStatus(c, now) === 'active')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((c) => ({
      code: c.code,
      discountLabel: c.discountType === 'percentage' ? `${c.discountValue}% off` : `\u20b9${c.discountValue} off`,
    }));
}

module.exports = { couponStatus, chipCoupons };

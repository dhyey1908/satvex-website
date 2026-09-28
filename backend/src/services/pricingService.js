const productService = require('./productService');
const couponService = require('./couponService');
const couponRedemptionService = require('./couponRedemptionService');
const settingsService = require('./settingsService');
const AppError = require('../utils/AppError');

/**
 * Re-derives a trustworthy line item from raw client input by re-reading the
 * product and selling option from the database. Never trust price/subtotal
 * values sent by the client.
 */
async function resolveLineItem({ productId, sellingOptionId, selectedColors }) {
  const product = await productService.findById(productId);
  if (!product || !product.isActive) {
    throw new AppError('This product is no longer available.', 400, 'PRODUCT_UNAVAILABLE');
  }

  const sellingOption = (product.sellingOptions || []).find((opt) => opt.id === sellingOptionId);
  if (!sellingOption || !sellingOption.isActive) {
    throw new AppError('This selling option is no longer available.', 400, 'SELLING_OPTION_UNAVAILABLE');
  }

  if (!Array.isArray(selectedColors) || selectedColors.length !== sellingOption.quantity) {
    throw new AppError(
      `Select exactly ${sellingOption.quantity} color(s) for "${sellingOption.name}".`,
      400,
      'INVALID_COLOR_SELECTION'
    );
  }

  const variantsById = new Map((product.variants || []).map((v) => [v.id, v]));
  for (const colorId of selectedColors) {
    const variant = variantsById.get(colorId);
    if (!variant || !variant.isActive) {
      throw new AppError('One or more selected colors are not available.', 400, 'INVALID_COLOR_SELECTION');
    }
    // Re-checked here (not just on the frontend) since this is the single
    // choke point every add-to-cart/checkout/reorder path already runs
    // through — a color marked out of stock after it was added to a cart
    // must still be rejected at purchase time.
    if (variant.inStock === false) {
      throw new AppError(`"${variant.colorName}" is currently out of stock.`, 400, 'COLOR_OUT_OF_STOCK');
    }
  }

  if (!sellingOption.allowDuplicateColors) {
    const unique = new Set(selectedColors);
    if (unique.size !== selectedColors.length) {
      throw new AppError('Duplicate colors are not allowed for this option.', 400, 'DUPLICATE_COLORS_NOT_ALLOWED');
    }
  }

  const selectedColorDetails = selectedColors.map((id) => {
    const v = variantsById.get(id);
    return { id, colorName: v.colorName, colorCode: v.colorCode };
  });

  return {
    productId: product.productId,
    productName: product.name,
    productSlug: product.slug,
    productImage: selectedColorDetails.length === 1 ? variantsById.get(selectedColorDetails[0].id)?.image || product.images?.[0] || null : product.images?.[0] || null,
    sellingOptionId: sellingOption.id,
    sellingOptionName: sellingOption.name,
    selectedColors,
    selectedColorDetails,
    unitPrice: sellingOption.price,
    // Reference-only original price for display (strike-through/discount%).
    // Never used in any total/subtotal math — that's always unitPrice.
    compareAtPrice: sellingOption.compareAtPrice ?? null,
  };
}

/**
 * Re-validates a coupon code against the current, real subtotal and computes
 * the discount server-side. Never trust a discount amount sent by the client.
 * Does NOT increment usage — callers that actually place an order do that
 * separately (via couponService.incrementUsage) so a preview never consumes
 * a redemption.
 */
async function validateCoupon(code, subtotal, userId) {
  const coupon = await couponService.findByCode(code);
  if (!coupon || !coupon.isActive) {
    throw new AppError('Invalid coupon code.', 400, 'INVALID_COUPON');
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    throw new AppError('This coupon has expired.', 400, 'COUPON_EXPIRED');
  }
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    throw new AppError('This coupon has reached its usage limit.', 400, 'COUPON_EXHAUSTED');
  }
  if (coupon.oneUsePerCustomer && userId) {
    const already = await couponRedemptionService.hasRedeemed(coupon.code, userId);
    if (already) {
      throw new AppError('You have already used this coupon.', 409, 'COUPON_ALREADY_USED');
    }
  }

  const rawDiscount =
    coupon.discountType === 'percentage' ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  const discountAmount = Number(Math.min(rawDiscount, subtotal).toFixed(2));

  return { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount };
}

/**
 * The single, centralized checkout-math function — used by both the /orders
 * quote preview and the real checkout, so there is exactly one place the
 * subtotal -> discount -> GST -> shipping -> COD formula lives. Pure/read-only:
 * validates the coupon (including per-customer eligibility) but never
 * increments usage or records a redemption — callers that actually place an
 * order do that separately, after this succeeds.
 *
 * Order of operations (matches the spec's flow exactly):
 *   subtotal -> coupon discount -> taxable amount -> GST -> shipping -> COD -> total
 */
async function calculateTotals({ items, couponCode, paymentMethod, userId }) {
  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

  let couponResult = null;
  if (couponCode) {
    couponResult = await validateCoupon(couponCode, subtotal, userId);
  }
  const discountAmount = couponResult?.discountAmount || 0;
  const taxableAmount = Number((subtotal - discountAmount).toFixed(2));

  const settings = await settingsService.getSettings();

  const gstEnabled = Boolean(settings.tax?.enabled);
  const gstPercent = gstEnabled ? Number(settings.tax?.percent ?? 0) : 0;
  const gstAmount = gstEnabled ? Number(((taxableAmount * gstPercent) / 100).toFixed(2)) : 0;

  const shippingEnabled = Boolean(settings.shipping?.enabled);
  const freeThreshold = settings.shipping?.freeThreshold;
  let shipping = 0;
  if (shippingEnabled) {
    const qualifiesForFree = freeThreshold != null && freeThreshold > 0 && subtotal >= freeThreshold;
    shipping = qualifiesForFree ? 0 : Number(settings.shipping?.charge ?? 0);
  }

  const codEnabled = Boolean(settings.cod?.enabled);
  const codCharge = paymentMethod === 'COD' && codEnabled ? Number(settings.cod?.charge ?? 0) : 0;

  const total = Number((taxableAmount + gstAmount + shipping + codCharge).toFixed(2));

  return {
    subtotal,
    couponCode: couponResult?.code || null,
    discountAmount,
    taxableAmount,
    gstPercent,
    gstAmount,
    shippingEnabled,
    shipping,
    codCharge,
    paymentMethod,
    total,
  };
}

module.exports = { resolveLineItem, validateCoupon, calculateTotals };

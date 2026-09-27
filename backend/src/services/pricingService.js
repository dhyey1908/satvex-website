const productService = require('./productService');
const couponService = require('./couponService');
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

  const activeVariantIds = new Set(
    (product.variants || []).filter((v) => v.isActive).map((v) => v.id)
  );
  for (const colorId of selectedColors) {
    if (!activeVariantIds.has(colorId)) {
      throw new AppError('One or more selected colors are not available.', 400, 'INVALID_COLOR_SELECTION');
    }
  }

  if (!sellingOption.allowDuplicateColors) {
    const unique = new Set(selectedColors);
    if (unique.size !== selectedColors.length) {
      throw new AppError('Duplicate colors are not allowed for this option.', 400, 'DUPLICATE_COLORS_NOT_ALLOWED');
    }
  }

  const variantsById = new Map((product.variants || []).map((v) => [v.id, v]));
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
async function validateCoupon(code, subtotal) {
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

  const rawDiscount =
    coupon.discountType === 'percentage' ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  const discountAmount = Number(Math.min(rawDiscount, subtotal).toFixed(2));

  return { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount };
}

module.exports = { resolveLineItem, validateCoupon };

// Guardrails when an admin saves a product's prices. Not a hard block: the admin
// is asked "Are you sure? Price is ₹X" and can confirm (a ₹2 test price, a real
// clearance) - but a typo like 24.9 for 2490 can't slip through unnoticed.
const rupees = (n) => `₹${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;

/**
 * @param sellingOptions the options being saved
 * @param previous       the options already stored (only changed prices are checked)
 * @param limits         { minSellingPrice, maxDiscountPercent } from settings
 * @returns [{ optionName, price, compareAtPrice, reason, message }]
 */
function checkPrices(sellingOptions = [], previous = [], limits = {}) {
  const min = Number(limits.minSellingPrice ?? 50);
  const maxDiscount = Number(limits.maxDiscountPercent ?? 90);
  const before = new Map(previous.map((o) => [o.id, o]));
  const warnings = [];

  for (const option of sellingOptions) {
    if (option.isActive === false) continue;
    const old = before.get(option.id);
    if (old && old.price === option.price && (old.compareAtPrice ?? null) === (option.compareAtPrice ?? null)) continue; // unchanged

    if (option.price < min) {
      warnings.push({
        optionName: option.name,
        price: option.price,
        reason: 'below_minimum',
        message: `${option.name}: the price is ${rupees(option.price)}, below the minimum of ${rupees(min)}.`,
      });
    }
    if (option.compareAtPrice > option.price) {
      const off = ((option.compareAtPrice - option.price) / option.compareAtPrice) * 100;
      if (off > maxDiscount) {
        warnings.push({
          optionName: option.name,
          price: option.price,
          compareAtPrice: option.compareAtPrice,
          reason: 'discount_too_deep',
          message: `${option.name}: ${rupees(option.price)} is ${Math.round(off)}% below the MRP of ${rupees(option.compareAtPrice)} (limit ${maxDiscount}%).`,
        });
      }
    }
  }
  return warnings;
}

module.exports = { checkPrices };

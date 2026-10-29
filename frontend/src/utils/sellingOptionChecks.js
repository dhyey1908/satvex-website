// Live checks for one selling option in the product editor. Display/validation
// only: the server re-validates everything on save (and asks again for unusual
// prices - see backend priceGuardService).

export const LOW_PRICE_LIMIT = 50; // rupees
export const DEEP_DISCOUNT_PERCENT = 80;

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * @returns {{ errors: string[], warnings: string[], discountPct: number|null, profit: number|null }}
 *   errors block saving; warnings are shown in amber and need a confirmation on Save.
 */
export function checkSellingOption(option) {
  const price = num(option.price);
  const mrp = num(option.compareAtPrice);
  const cost = num(option.costPrice);
  const quantity = num(option.quantity);
  const errors = [];
  const warnings = [];

  if (!option.name?.trim()) errors.push('Give the option a name.');
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('Colours required must be 1 or more.');
  if (price === null || !(price > 0)) errors.push('Selling price must be more than ₹0.');
  if (mrp !== null && mrp > 0 && price !== null && price > mrp) errors.push('Selling price cannot be more than the MRP.');

  const discountPct = mrp !== null && mrp > 0 && price !== null && price >= 0 && price <= mrp ? Math.round(((mrp - price) / mrp) * 100) : null;

  if (price !== null && price > 0) {
    if (price < LOW_PRICE_LIMIT || (discountPct !== null && discountPct > DEEP_DISCOUNT_PERCENT)) {
      warnings.push('This price looks unusually low. Please confirm.');
    }
    if (cost !== null && cost > price) warnings.push('You are selling at a loss.');
  }

  const profit = cost !== null && price !== null && price > 0 ? Number((price - cost).toFixed(2)) : null;
  return { errors, warnings, discountPct, profit };
}

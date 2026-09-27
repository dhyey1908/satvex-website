// Derived (not stored) SKU — a real, stable value computed from existing IDs,
// not a hardcoded/fake number. See 04-product-system.md.
export function deriveSku(productId, variantId) {
  if (!productId) return '';
  const shortProductId = productId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const variantPart = variantId ? variantId.replace(/^var_/, '').toUpperCase() : 'XX';
  return `SATVEX-${shortProductId}-${variantPart}`;
}

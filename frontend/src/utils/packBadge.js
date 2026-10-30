// The highlight badge on a selling-option card ("Best Value", "Most Popular"...).
// It is set per pack in the admin (sellingOption.badgeLabel). Packs saved before that field existed
// keep the one badge the site used to hard-code, until the product is saved again from the admin.
export function packBadge(option, legacy = {}) {
  if (typeof option.badgeLabel === 'string') return option.badgeLabel.trim();
  return legacy.featuredOptionId && legacy.featuredOptionId === option.id ? legacy.featuredOptionLabel || '' : '';
}

// Where a banner / announcement may point. Pure helpers so the rules are testable.

export const PAGE_LINKS = [
  { value: '/shop', label: 'Shop' },
  { value: '/about', label: 'About' },
  { value: '/contact', label: 'Contact' },
];
const KNOWN_PATHS = new Set(['/', '/shop', '/about', '/contact', '/shipping-policy', '/returns-refunds', '/privacy-policy', '/terms-conditions']);

/** Error text for a link, or '' when it is fine (or empty). `products` = [{ slug }] once loaded. */
export function linkProblem(value, products) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return /^https:\/\//i.test(v) ? '' : 'Use https:// for outside links.';
  if (!v.startsWith('/')) return 'Start with / for a page on this site (e.g. /shop), or https:// for another site.';
  const path = v.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path.startsWith('/product/')) {
    const slug = path.slice('/product/'.length);
    if (products && !products.some((p) => p.slug === slug)) return `No product with the address “${slug}”.`;
    return '';
  }
  return KNOWN_PATHS.has(path) ? '' : `“${path}” is not a page on this site.`;
}

/** Which dropdown entry a stored link corresponds to: its own value, or 'custom'. */
export function pickerValue(value, products) {
  if (!value) return '';
  if (PAGE_LINKS.some((p) => p.value === value)) return value;
  if (products?.some((p) => `/product/${p.slug}` === value)) return value;
  return 'custom';
}

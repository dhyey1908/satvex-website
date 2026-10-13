/*
 * Generates public/sitemap.xml before the production build.
 * Always includes the static pages; also includes product pages when the
 * API is reachable at build time (falls back gracefully if not, so a
 * missing/unreachable backend never breaks the build).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITE_URL = process.env.SITE_URL || 'https://satvex.com';
const API_URL = process.env.VITE_API_URL || 'http://localhost:4000/api';

const STATIC_PATHS = [
  '/',
  '/shop',
  '/about',
  '/contact',
  '/shipping-policy',
  '/returns-refunds',
  '/privacy-policy',
  '/terms-conditions',
];

async function fetchProductSlugs() {
  try {
    const res = await fetch(`${API_URL}/products`);
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data?.products || []).filter((p) => p.isActive).map((p) => p.slug);
  } catch {
    return [];
  }
}

function urlEntry(loc) {
  return `  <url><loc>${SITE_URL}${loc}</loc></url>`;
}

async function main() {
  const productSlugs = await fetchProductSlugs();
  const paths = [...STATIC_PATHS, ...productSlugs.map((slug) => `/product/${slug}`)];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(urlEntry).join('\n')}
</urlset>
`;

  const outPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
  fs.writeFileSync(outPath, xml);
  console.log(`sitemap.xml written with ${paths.length} URLs (${productSlugs.length} products) -> ${outPath}`);
}

main();

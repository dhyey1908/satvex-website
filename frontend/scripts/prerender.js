/*
 * Prerenders the three crawler-facing page types (home, shop, each product)
 * into static HTML after `vite build`, so crawlers and link-preview bots that
 * never run JavaScript get a real <title>, description, canonical URL, Open
 * Graph / Twitter tags, Product JSON-LD and crawlable content instead of an
 * empty loading screen. The React app still takes over in the browser
 * (createRoot replaces the static markup).
 *
 * Output (served by FrontendRouterFunction in backend/template.yaml):
 *   dist/_pre/home.html              <- "/"
 *   dist/_pre/shop.html              <- "/shop"
 *   dist/_pre/product/<slug>.html    <- "/product/<slug>"  (slugs listed in the
 *                                       PrerenderedProductSlugs stack parameter)
 * dist/index.html stays the generic shell every other route uses.
 *
 * Product data comes from the live API at build time (VITE_API_URL). If the API
 * is unreachable the step is skipped with a warning and the build still
 * succeeds (the site simply falls back to client-side meta).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, absoluteUrl, buildProductJsonLd } from '../src/utils/seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const API_URL = process.env.VITE_API_URL || 'http://localhost:4000/api';

const HOME_TITLE = 'Satvex — Designed for Her. Made to Move.';
const HOME_DESC =
  'SATVEX creates modern women-focused essentials designed around flexibility, comfort, durability and effortless style.';
const SHOP_DESC = 'Shop Satvex claw clips and hair accessories — combos of 2 and 3 in a range of colours.';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = await res.json();
  return body.data ?? body;
}

function displayName(product) {
  return /claw clip/i.test(product.name) ? product.name : `${product.name} Claw Clip`;
}

function headBlock({ title, description, pathname, image, type, jsonLd }) {
  const url = absoluteUrl(pathname);
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ];
  if (image) {
    lines.push(`<meta property="og:image" content="${esc(image)}" />`, `<meta name="twitter:image" content="${esc(image)}" />`);
  }
  if (jsonLd) lines.push(`<script type="application/ld+json" id="product-jsonld">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  return lines.join('\n    ');
}

// Drops the generic shell's own copies of every tag the page-specific block
// re-declares, then injects the block before </head> and the static body.
function render(template, { head, body }) {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:(?:title|description|type|site_name|url|image)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace('</head>', `    ${head}\n  </head>`);
  const marker = /<!--app-skeleton-->[\s\S]*?<!--\/app-skeleton-->/;
  if (!marker.test(html)) throw new Error('dist/index.html has no <!--app-skeleton--> markers');
  return html.replace(marker, `<!--app-skeleton-->${body}<!--/app-skeleton-->`);
}

const shell = (inner) => `<main class="prerender" style="max-width:960px;margin:0 auto;padding:32px 20px;font-family:Poppins,system-ui,sans-serif;color:#3a2a2e">${inner}</main>`;

function productList(products) {
  if (products.length === 0) return '';
  return `<ul>${products
    .map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(displayName(p))}</a> — from ₹${Math.min(...p.sellingOptions.filter((o) => o.isActive).map((o) => o.price))}</li>`)
    .join('')}</ul>`;
}

function write(rel, html) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(`prerendered ${rel}`);
}

async function main() {
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('Run `vite build` first (dist/index.html missing).');
  const template = fs.readFileSync(indexPath, 'utf-8');

  let products;
  try {
    products = (await getJson(`${API_URL}/products`)).products.filter((p) => p.isActive && p.sellingOptions?.some((o) => o.isActive));
  } catch (err) {
    // Home and shop are ALWAYS written - the CDN routes "/" and "/shop" to
    // them. Without the API they just have no product list; no product pages
    // are produced, so keep PrerenderedProductSlugs empty for such a build.
    console.warn(`API unreachable (${err.message}): prerendering home/shop without products, no product pages.`);
    products = [];
  }

  const firstImage = (p) => absoluteUrl(p.images?.[0] || p.variants?.find((v) => v.image)?.image);

  write(
    '_pre/home.html',
    render(template, {
      head: headBlock({ title: HOME_TITLE, description: HOME_DESC, pathname: '/', image: absoluteUrl(DEFAULT_OG_IMAGE) || (products[0] && firstImage(products[0])), type: 'website' }),
      body: shell(`<h1>${esc(SITE_NAME)} — Designed for Her. Made to Move.</h1><p>${esc(HOME_DESC)}</p><h2>Shop</h2>${productList(products)}`),
    })
  );

  write(
    '_pre/shop.html',
    render(template, {
      head: headBlock({ title: `Shop — ${SITE_NAME}`, description: SHOP_DESC, pathname: '/shop', image: products[0] && firstImage(products[0]), type: 'website' }),
      body: shell(`<h1>Shop ${esc(SITE_NAME)}</h1><p>${esc(SHOP_DESC)}</p>${productList(products)}`),
    })
  );

  const slugs = [];
  for (const p of products) {
    let reviewSummary = null;
    try {
      reviewSummary = (await getJson(`${API_URL}/products/${encodeURIComponent(p.productId)}/reviews?limit=1`)).summary;
    } catch {
      // no summary -> no aggregateRating (never guessed)
    }
    const name = displayName(p);
    const pathname = `/product/${p.slug}`;
    const options = p.sellingOptions.filter((o) => o.isActive);
    write(
      `_pre/product/${p.slug}.html`,
      render(template, {
        head: headBlock({
          title: `${name} — ${SITE_NAME}`,
          description: p.shortDescription || HOME_DESC,
          pathname,
          image: firstImage(p),
          type: 'product',
          jsonLd: buildProductJsonLd({ ...p, name }, { reviewSummary, path: pathname }),
        }),
        body: shell(
          `<h1>${esc(name)}</h1><p>${esc(p.shortDescription)}</p>` +
            `<ul>${options.map((o) => `<li>${esc(o.name)} — ₹${o.price}</li>`).join('')}</ul>` +
            (p.description ? p.description.split(/\n+/).filter(Boolean).map((para) => `<p>${esc(para)}</p>`).join('') : '')
        ),
      })
    );
    slugs.push(p.slug);
  }
  console.log(`\nPrerendered product slugs (keep the PrerenderedProductSlugs stack parameter in sync): ${slugs.join(',')}`);
  if (SITE_URL) console.log(`canonical host: ${SITE_URL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

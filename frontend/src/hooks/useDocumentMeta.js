import { useEffect } from 'react';
import { SITE_NAME, DEFAULT_OG_IMAGE, absoluteUrl, buildProductJsonLd } from '../utils/seo';

function setMetaTag(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    // A tag a previous page set must not leak onto this one.
    if (el && attr === 'property' && key === 'og:image') el.remove();
    if (el && attr === 'name' && key === 'twitter:image') el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets the document title, description, canonical URL and Open Graph / Twitter
 * tags for the current page. Everything absolute is on the canonical host
 * (utils/seo.js), whichever host the visitor happens to be on. The built site
 * also ships these tags prerendered into the HTML for the home, shop and
 * product pages (scripts/prerender.js), so crawlers and link-preview bots that
 * don't run JavaScript see them too; this hook keeps them right after
 * client-side navigation.
 */
export function useDocumentMeta({ title, description, path, noindex = false, image, type = 'website' }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Beauty & Fashion Accessories`;
    document.title = fullTitle;

    const url = path ? absoluteUrl(path) : null;
    const ogImage = absoluteUrl(image) || absoluteUrl(DEFAULT_OG_IMAGE);

    if (description) setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:title', fullTitle);
    if (description) setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:site_name', SITE_NAME);
    setMetaTag('property', 'og:url', url);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
    setMetaTag('name', 'twitter:title', fullTitle);
    if (description) setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', ogImage);

    // Private / transactional pages (cart, checkout, account, admin, 404) must
    // not be indexed. The tag is reset on every page so a noindex page never
    // leaks its directive into the next one.
    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    if (url) setCanonical(url);
    return () => setMetaTag('name', 'robots', 'index, follow');
  }, [title, description, path, noindex, image, type]);
}

export function setProductStructuredData(product, { reviewSummary } = {}) {
  const existing = document.getElementById('product-jsonld');
  if (existing) existing.remove();
  if (!product) return;

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-jsonld';
  script.textContent = JSON.stringify(buildProductJsonLd(product, { reviewSummary, path: `/product/${product.slug}` }));
  document.head.appendChild(script);
}

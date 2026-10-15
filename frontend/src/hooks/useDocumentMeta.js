import { useEffect } from 'react';

function setMetaTag(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
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
 * Sets document title/description/canonical/OG tags for the current page.
 * This is a client-rendered SPA (no SSR), so this primarily helps the browser
 * tab, social share previews fetched after JS runs, and canonical hygiene —
 * not a substitute for server-rendered meta for crawlers that don't execute JS.
 */
export function useDocumentMeta({ title, description, path, noindex = false }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — Satvex` : 'Satvex — Beauty & Fashion Accessories';
    document.title = fullTitle;

    setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);

    // Private / transactional pages (cart, checkout, account, admin, 404) must
    // not be indexed. The tag is reset on every page so a noindex page never
    // leaks its directive into the next one.
    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    if (path) {
      setCanonical(`${window.location.origin}${path}`);
    }
    return () => setMetaTag('name', 'robots', 'index, follow');
  }, [title, description, path, noindex]);
}

export function setProductStructuredData(product) {
  const existing = document.getElementById('product-jsonld');
  if (existing) existing.remove();
  if (!product) return;

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-jsonld';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.images,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.basePrice,
      availability: product.isActive ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  });
  document.head.appendChild(script);
}

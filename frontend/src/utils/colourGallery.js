// Which photos the product page shows. A product has COMMON photos (every colour)
// and COLOUR photos (only while that colour is selected):
//   gallery = [selected colour's photos, primary first] + [common photos]
// A colour with no photos simply shows the common ones; an older product with
// neither falls back to its plain `images` list so there is never an empty frame.

export const colourSlug = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The colour to show before the customer has picked one: ?color=<slug> if valid, else the first active, in-stock colour. */
export function defaultColourId(variants = [], colourParam) {
  const active = variants.filter((v) => v.isActive);
  const fromUrl = colourParam ? active.find((v) => colourSlug(v.colorName) === colourParam.toLowerCase()) : null;
  return (fromUrl || active.find((v) => v.inStock !== false) || active[0])?.id ?? null;
}

const primaryFirst = (images = []) => [...images].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));

/** @returns {{ urls: string[], altByUrl: Record<string,string> }} */
export function galleryFor(product, variantId) {
  const variant = (product.variants || []).find((v) => v.id === variantId);
  const colour = variant ? primaryFirst(variant.images) : [];
  const common = product.commonImages?.length ? product.commonImages : (product.images || []).map((url) => ({ url, alt: '' }));

  const urls = [];
  const altByUrl = {};
  const add = (img, fallbackAlt) => {
    if (!img.url || urls.includes(img.url)) return;
    urls.push(img.url);
    altByUrl[img.url] = img.alt || fallbackAlt;
  };
  const name = product.displayName || product.name;
  colour.forEach((img) => add(img, `SATVEX ${name} – ${variant.colorName}`));
  common.forEach((img) => add(img, `SATVEX ${name}`));
  return { urls, altByUrl };
}

/** Does this URL belong to one of the colours' photos? (for the colour label on the image) */
export const variantForUrl = (variants = [], url) => variants.find((v) => (v.images || []).some((p) => p.url === url)) || null;

// Product photos come in two kinds:
//   - COMMON photos (product.commonImages): shown whatever colour is selected;
//   - COLOUR photos (variant.images): shown only while that colour is selected.
// Older products only have product.images (strings) and one variant.image each.
// Those fields are KEPT in step with the new ones so every older consumer
// (cart, orders, product cards, SEO) keeps working:
//   product.images        = the common photo URLs, in order
//   variant.image         = the URL of the colour's primary photo
// and read-side normalisation lets a product saved before this change show up in
// the new shape without a data migration.

const MAX_COLOUR_IMAGES = 10;
const MAX_COMMON_IMAGES = 30;

const photo = (url, alt = '', isPrimary = false) => ({ url, alt: alt || '', isPrimary });

// Exactly one primary per colour (the first marked one, else the first photo);
// drops empty/duplicate URLs.
function withOnePrimary(images = []) {
  const seen = new Set();
  const list = [];
  for (const img of images) {
    const url = typeof img === 'string' ? img : img?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    list.push(photo(url, img?.alt, Boolean(img?.isPrimary)));
  }
  const primaryIndex = Math.max(0, list.findIndex((i) => i.isPrimary));
  return list.map((i, idx) => ({ ...i, isPrimary: idx === primaryIndex }));
}

/** For a product read from the database (or an older client's payload): the new fields are always present. */
function normalizeProductImages(product) {
  if (!product) return product;
  const commonImages = (product.commonImages ?? (product.images || []).map((url) => photo(url))).map((i) => photo(i.url, i.alt));
  const variants = (product.variants || []).map((v) => {
    const images = withOnePrimary(v.images ?? (v.image ? [photo(v.image, '', true)] : []));
    return { ...v, images, image: images.find((i) => i.isPrimary)?.url || '' };
  });
  return { ...product, commonImages, images: commonImages.map((i) => i.url), variants };
}

/** Throws a plain message if the photo lists are not acceptable (sizes, shape). */
function assertImageLimits(data) {
  if ((data.commonImages || []).length > MAX_COMMON_IMAGES) throw new Error(`Up to ${MAX_COMMON_IMAGES} common images.`);
  for (const v of data.variants || []) {
    if ((v.images || []).length > MAX_COLOUR_IMAGES) throw new Error(`Up to ${MAX_COLOUR_IMAGES} photos per colour (${v.colorName}).`);
  }
}

/**
 * Before saving: derive the legacy fields from the new ones, one primary per
 * colour, no duplicates. Fields that were not sent (a partial update) stay
 * untouched.
 */
function prepareImagesForSave(data) {
  const out = { ...data };
  if (out.commonImages !== undefined || out.images !== undefined) {
    const source = out.commonImages ?? out.images.map((url) => photo(url));
    const seen = new Set();
    out.commonImages = source
      .map((i) => photo(typeof i === 'string' ? i : i.url, i.alt))
      .filter((i) => i.url && !seen.has(i.url) && seen.add(i.url));
    out.images = out.commonImages.map((i) => i.url);
  }
  if (out.variants) {
    out.variants = out.variants.map((v) => {
      const images = withOnePrimary(v.images ?? (v.image ? [photo(v.image, '', true)] : []));
      return { ...v, images, image: images.find((i) => i.isPrimary)?.url || '' };
    });
  }
  assertImageLimits(out);
  return out;
}

module.exports = { normalizeProductImages, prepareImagesForSave, withOnePrimary, MAX_COLOUR_IMAGES, MAX_COMMON_IMAGES };

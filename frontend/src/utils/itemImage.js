// Display helpers for a cart / order line and the colours chosen on it.

const idsOf = (item) => item.selectedColorDetails?.map((c) => c.id) ?? item.selectedColors ?? [];

function variantFor(item, catalog, colorId) {
  const product = catalog?.find((p) => p.productId === item.productId);
  return product?.variants?.find((v) => v.id === colorId) || null;
}

/**
 * The photo to show for a line: the first chosen colour's own photo (for a
 * combo, the first selected colour), then the catalogue's photo for that colour
 * (covers older lines), and only then the line's stored main photo.
 */
export function itemImage(item, catalog) {
  const firstId = idsOf(item)[0];
  return (
    item.selectedColorDetails?.[0]?.image ||
    (firstId && variantFor(item, catalog, firstId)?.image) ||
    item.productImage ||
    null
  );
}

/** Chosen colours with duplicates grouped: [{ id, name, code, count, image }] in pick order. */
export function colorGroups(item, catalog) {
  const groups = new Map();
  const details = item.selectedColorDetails;
  const ids = idsOf(item);
  ids.forEach((id, i) => {
    const d = details?.find((c) => c.id === id) || details?.[i];
    const v = variantFor(item, catalog, id);
    const g = groups.get(id);
    if (g) g.count += 1;
    else groups.set(id, { id, name: d?.colorName || v?.colorName || 'Colour', code: d?.colorCode || v?.colorCode, count: 1, image: d?.image || v?.image || null });
  });
  return [...groups.values()];
}

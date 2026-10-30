// What shoppers get of a product's "Top Highlight": nothing unless it is on and has a headline.
function publicTopHighlight(highlight) {
  if (!highlight || highlight.enabled !== true || !highlight.headline) return null;
  return {
    eyebrow: highlight.eyebrow || '',
    headline: highlight.headline,
    subline: highlight.subline || '',
    chips: (highlight.chips || []).map(({ id, icon, label }) => ({ id, icon, label })),
    style: highlight.style === 'lavender' ? 'lavender' : 'plain',
  };
}

module.exports = { publicTopHighlight };

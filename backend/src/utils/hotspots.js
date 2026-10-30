// What shoppers get of a product's "Feature Hotspots": nothing unless the section is on, has its
// main photo and at least one active feature that is placed on the photo.
const PLACEMENTS = ['after_info', 'before_reviews'];

function publicHotspotSection(section) {
  if (!section || section.enabled !== true || !section.imageUrl) return null;
  const hotspots = (section.hotspots || [])
    .filter((h) => h.active !== false && h.pointX != null && h.pointY != null && h.title && h.description)
    .map(({ id, pointX, pointY, labelPosition, title, description, imageUrl, imageAspect }) => ({
      id,
      pointX,
      pointY,
      labelPosition: labelPosition || 'top-right',
      title,
      description,
      imageUrl: imageUrl || '',
      imageAspect: imageAspect || null,
    }));
  if (hotspots.length === 0) return null;
  return {
    title: section.title || '',
    imageUrl: section.imageUrl,
    imageAspect: section.imageAspect || null,
    placement: PLACEMENTS.includes(section.placement) ? section.placement : 'after_info',
    loop: section.loop !== false,
    autoplay: section.autoplay === true,
    hotspots,
  };
}

// The starter features from the brief (Butterfly claw clip). No marker positions: the owner places
// them on the real photo in the visual editor, so it stays switched off until then.
const STARTER_HOTSPOT_SECTION = {
  enabled: false,
  title: 'every detail, *thought through*.',
  imageUrl: '',
  placement: 'after_info',
  loop: true,
  autoplay: false,
  hotspots: [
    { pointX: null, pointY: null, labelPosition: 'top-right', title: 'flexible body', description: 'bends and bounces back instead of snapping. lean back, relax, wear it all day.', imageUrl: '', active: true },
    { pointX: null, pointY: null, labelPosition: 'bottom-left', title: 'rounded teeth', description: 'smooth, rounded teeth grip your hair without digging into your scalp.', imageUrl: '', active: true },
    { pointX: null, pointY: null, labelPosition: 'top-left', title: 'strong spring', description: 'a sturdy spring keeps your hold secure from morning to night.', imageUrl: '', active: true },
    { pointX: null, pointY: null, labelPosition: 'bottom-right', title: 'feather-light', description: "so light, you'll forget you're wearing it.", imageUrl: '', active: true },
  ],
};

module.exports = { publicHotspotSection, STARTER_HOTSPOT_SECTION };

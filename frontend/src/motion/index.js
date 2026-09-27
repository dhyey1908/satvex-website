// Shared Framer Motion building blocks. Every page/component should reuse
// these instead of writing ad hoc transition configs, so motion stays
// consistent across the app (see 02-ui-ux-design.md "Motion System").

export const EASE = [0.16, 1, 0.3, 1];

export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
};

export const SPRING = { type: 'spring', stiffness: 300, damping: 30 };
export const SPRING_SOFT = { type: 'spring', stiffness: 220, damping: 26 };

// Simple fade, for anything that just needs to appear/disappear cleanly
// (reduced-motion fallback target for most of the variants below).
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE } },
};

// Fade + rise — the default "this just entered the page" motion.
export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE } },
};

// Staggered parent — children should use `fadeUp` (or another child variant)
// and inherit timing from this container via `variants` + no explicit
// `animate` on the child.
export function staggerContainer(staggerChildren = 0.08, delayChildren = 0) {
  return {
    initial: {},
    animate: {
      transition: { staggerChildren, delayChildren },
    },
  };
}

// Scroll-triggered reveal — pass to `whileInView`, pair with `initial="initial"`
// and `viewport={{ once: true, margin: '-80px' }}` on the element.
export const revealOnScroll = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE } },
};

// Crossfade — used for image swaps (gallery thumbnail change, color/variant
// switch). Pair with AnimatePresence mode="wait" or mode="popLayout" and a
// changing `key` on the element.
export const crossfade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE } },
};

// List item exit for AnimatePresence + layout (cart rows, wishlist cards).
// Height animates on both entry and exit so sibling rows smoothly reflow
// into/out of the freed space instead of snapping.
export const listItem = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, height: 0, scale: 0.98, transition: { duration: DURATION.base, ease: EASE } },
};

// Modal / centered dialog.
export const modalPanel = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE } },
};

// Bottom sheet (mobile modal/drawer variant).
export const bottomSheet = {
  initial: { y: '100%' },
  animate: { y: 0, transition: SPRING_SOFT },
  exit: { y: '100%', transition: { duration: DURATION.fast, ease: EASE } },
};

// Side drawer (desktop filter/search drawer).
export const sideDrawer = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: DURATION.base, ease: EASE } },
  exit: { x: '100%', transition: { duration: DURATION.fast, ease: EASE } },
};

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

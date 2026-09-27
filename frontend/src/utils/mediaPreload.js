/**
 * Shared image/video preloading so any "switch to a new image" interaction
 * (color swatch, gallery thumbnail, hero banner rotation) can wait for the
 * next asset to actually be ready before swapping to it, instead of
 * remounting a fresh <img>/<video> and showing a blank frame while it
 * fetches. Once a URL has loaded here, later switches back to it are
 * instant — it's tracked in this module-level cache for the life of the
 * page, so we never re-fetch/re-decode something already seen.
 */
const loadedMedia = new Set();

export function isMediaPreloaded(src) {
  return !src || loadedMedia.has(src);
}

export function preloadMedia(src, type = 'image') {
  if (!src || loadedMedia.has(src)) return Promise.resolve();

  if (type === 'video') {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      const finish = () => {
        loadedMedia.add(src);
        resolve();
      };
      video.addEventListener('loadeddata', finish, { once: true });
      video.addEventListener('error', () => resolve(), { once: true });
      // Some CDNs/browsers never fire loadeddata reliably for short muted
      // clips — don't let a slow/unfired event block the swap forever.
      window.setTimeout(finish, 2500);
      video.src = src;
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      loadedMedia.add(src);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

// Photos of any size are accepted; anything over MAX_IMAGE_BYTES is re-encoded in
// the browser (smaller dimensions, then lower quality) until it is at most that big.
// Smaller photos are uploaded untouched.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** photo.png -> photo.webp (the name must match the re-encoded type). */
export const renamedFor = (name, type) => `${name.replace(/\.[^./\\]+$/, '')}.${EXT[type] || 'jpg'}`;

/** Attempts to try, biggest first: [{ scale, quality }]. The first scale aims just under the limit. */
export function shrinkSteps(bytes, maxBytes = MAX_IMAGE_BYTES, lossless = false) {
  // File size roughly follows pixel count, so start at the scale that should land near the limit.
  // A PNG shrinks a lot just by becoming a lossy WebP/JPEG, so it can start much closer to full size.
  const first = Math.min(1, Math.sqrt(maxBytes / bytes) * (lossless ? 2.5 : 0.95));
  const steps = [];
  for (const factor of [1, 0.85, 0.7, 0.55, 0.4]) {
    const scale = first * factor;
    for (const quality of [0.92, 0.85, 0.75]) steps.push({ scale, quality });
  }
  return steps;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image.'));
    };
    img.src = url;
  });
}

/**
 * @returns {Promise<File>} the same file when it already fits, else a re-encoded copy at most
 *                          `maxBytes` big. Throws if the image cannot be read or made small enough.
 */
export async function fitImage(file, maxBytes = MAX_IMAGE_BYTES) {
  if (file.size <= maxBytes) return file;

  const bitmap = await loadBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  // JPEG stays JPEG. PNG/WebP go to WebP (keeps transparency); a browser that cannot encode WebP
  // hands back PNG, in which case we use JPEG on a white background.
  let type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';

  for (const { scale, quality } of shrinkSteps(file.size, maxBytes, file.type !== 'image/jpeg')) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') {
      ctx.fillStyle = 'white'; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, type, quality);
    if (blob && blob.type !== type) {
      type = 'image/jpeg';
      ctx.fillStyle = 'white';
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blob = await toBlob(canvas, type, quality);
    }
    if (blob && blob.size <= maxBytes) {
      bitmap.close?.();
      return new File([blob], renamedFor(file.name, type), { type, lastModified: Date.now() });
    }
  }
  bitmap.close?.();
  throw new Error('Could not shrink this photo under 10 MB. Try a smaller one.');
}

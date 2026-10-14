// Grabs a still frame from a local video File so the storefront can show a
// light image in the slider instead of loading the video itself. Best-effort:
// resolves to null (never throws) when the browser can't decode the file or
// the frame can't be drawn, and the slider falls back to the video's own
// first frame.
const TIMEOUT_MS = 10000;

export function captureVideoFrame(file, { atSeconds = 0.5, maxWidth = 540, quality = 0.82 } = {}) {
  return new Promise((resolve) => {
    let objectUrl = null;
    let settled = false;
    const video = document.createElement('video');

    function finish(blob) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(blob);
    }

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.addEventListener('error', () => finish(null));
    video.addEventListener('loadedmetadata', () => {
      // Seeking a little in avoids the black first frame many clips start on.
      const target = Number.isFinite(video.duration) ? Math.min(atSeconds, video.duration / 2) : 0;
      video.currentTime = Math.max(0, target);
    });
    video.addEventListener('seeked', () => {
      try {
        const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((video.videoWidth || maxWidth) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || maxWidth) * scale));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', quality);
      } catch {
        finish(null);
      }
    });

    try {
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
    } catch {
      finish(null);
    }
  });
}

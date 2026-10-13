import { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { contactService } from '../services/contactService';
import './AttachmentUploader.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

function isVideo(type) {
  return type.startsWith('video/');
}

// Real per-file upload progress needs XMLHttpRequest — fetch() has no
// upload-progress event for the PUT body.
function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Please try again.'));
    xhr.send(file);
  });
}

// Multi-file (≤10), mixed image+video attachment picker for the Contact Us
// enquiry form — generalizes ReviewImageUploader.jsx's single-image flow
// (same getUploadUrl -> presigned PUT -> publicUrl pattern) into a
// sequential, progress-tracked, multi-select uploader.
export function AttachmentUploader({ files, onChange, max = 10, disabled }) {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  // `items` is this component's own bookkeeping (local preview blobs +
  // progress); `files`/`onChange` is the committed URL list the parent form
  // actually submits. Keep them in sync whenever a file finishes or is
  // removed.
  useEffect(() => {
    return () => {
      items.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handleFileChange(e) {
    const incoming = Array.from(e.target.files || []).slice(0, max - files.length);
    if (inputRef.current) inputRef.current.value = '';
    if (incoming.length === 0) return;

    setError(null);
    // `files` (the prop) won't reflect an onChange call made earlier in
    // this same loop until the parent re-renders and passes a new prop —
    // that re-render never happens mid-function, so accumulate locally
    // instead of reading the (stale) `files` prop on every iteration.
    const committed = [...files];

    for (const file of incoming) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Unsupported file type. Use JPEG, PNG, WebP, AVIF images or MP4 video.');
        continue;
      }
      const maxSize = isVideo(file.type) ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
      if (file.size > maxSize) {
        setError(`${isVideo(file.type) ? 'Video' : 'Image'} is too large. Max ${maxSize / (1024 * 1024)}MB.`);
        continue;
      }

      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setItems((prev) => [...prev, { id, file, previewUrl, status: 'uploading', progress: 0 }]);

      try {
        const { uploadUrl, publicUrl } = await contactService.getUploadUrl({
          filename: file.name,
          contentType: file.type,
        });
        await uploadWithProgress(uploadUrl, file, (pct) => updateItem(id, { progress: pct }));
        updateItem(id, { status: 'done', publicUrl });
        committed.push(publicUrl);
        onChange([...committed]);
      } catch (err) {
        updateItem(id, { status: 'error', error: err.message });
      }
    }
  }

  function handleRemove(id, publicUrl) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    if (publicUrl) onChange(files.filter((url) => url !== publicUrl));
  }

  const atMax = files.length >= max;

  return (
    <div className="attachment-uploader">
      {items.length > 0 && (
        <div className="attachment-uploader-grid">
          {items.map((item) => (
            <div key={item.id} className="attachment-uploader-item">
              {isVideo(item.file.type) ? (
                <video src={item.previewUrl} muted playsInline />
              ) : (
                <img src={item.previewUrl} alt="" />
              )}
              {item.status === 'uploading' && (
                <div className="attachment-uploader-progress">
                  <Loader2 size={16} className="btn-spinner" />
                  <span>{item.progress}%</span>
                </div>
              )}
              {item.status === 'error' && (
                <div className="attachment-uploader-progress attachment-uploader-error">
                  <AlertCircle size={16} />
                </div>
              )}
              <button
                type="button"
                className="attachment-uploader-remove"
                onClick={() => handleRemove(item.id, item.publicUrl)}
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!atMax && (
        <div className="attachment-uploader-input">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            multiple
            onChange={handleFileChange}
            disabled={disabled}
          />
          <span className="attachment-uploader-hint">Up to {max} photos/videos — {files.length}/{max} added</span>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

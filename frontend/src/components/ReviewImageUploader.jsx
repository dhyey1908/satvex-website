import { useRef, useState } from 'react';
import { reviewService } from '../services/reviewService';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
// S3's presigned PUT URL itself doesn't enforce a size cap (that needs a
// presigned POST policy, a bigger change than this feature needs) — this
// is the frontend-side guard; backend still validates type/count via
// reviewValidators.js's images schema.
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function ReviewImageUploader({ onUploaded, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Use JPEG, PNG, WebP or AVIF.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Image is too large. Max 5MB.');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await reviewService.getUploadUrl({
        filename: file.name,
        contentType: file.type,
      });

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload failed. Please try again.');

      onUploaded(publicUrl || uploadUrl.split('?')[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="review-image-uploader">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileChange}
        disabled={uploading || disabled}
      />
      {uploading && <span className="upload-status">Uploading…</span>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

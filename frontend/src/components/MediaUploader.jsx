import { useRef, useState } from 'react';
import { adminService } from '../services/adminService';

const TYPES_BY_KIND = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  video: ['video/mp4'],
};

export function MediaUploader({ folder, kind = 'image', onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const allowedTypes = TYPES_BY_KIND[kind];

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!allowedTypes.includes(file.type)) {
      setError(kind === 'video' ? 'Unsupported file type. Use MP4.' : 'Unsupported file type. Use JPEG, PNG, WebP or AVIF.');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await adminService.getUploadUrl({
        folder,
        filename: file.name,
        contentType: file.type,
      });

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to storage failed.');

      onUploaded(publicUrl || uploadUrl.split('?')[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="image-uploader">
      <input
        ref={inputRef}
        type="file"
        accept={allowedTypes.join(',')}
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <span className="upload-status">Uploading…</span>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

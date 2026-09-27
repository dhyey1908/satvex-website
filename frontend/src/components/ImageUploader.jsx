import { useRef, useState } from 'react';
import { adminService } from '../services/adminService';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export function ImageUploader({ folder, onUploaded }) {
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
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <span className="upload-status">Uploading…</span>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

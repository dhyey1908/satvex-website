import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { adminService } from '../services/adminService';
import { fitImage, MAX_IMAGE_BYTES } from '../utils/fitImage';
import './UploadZone.css';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NAMES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'video/mp4': 'MP4' };

// PUT with progress (fetch cannot report upload progress).
function putWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload to storage failed.')));
    xhr.onerror = () => reject(new Error('Upload to storage failed.'));
    xhr.send(file);
  });
}

/**
 * Drag-and-drop (or click) upload area for images. Files go straight to storage
 * as soon as they are chosen; `onUploaded(url)` is called for each one that
 * finishes. Nothing is live until the page's own Save - the caller only adds
 * the URLs to its draft.
 *
 * @param folder    S3 folder ('products' | 'variants' ...)
 * @param maxFiles  how many more files may be added (extra ones are refused with a message)
 */
export function UploadZone({
  folder,
  onUploaded,
  maxFiles = 30,
  multiple = true,
  disabled = false,
  types = IMAGE_TYPES,
  maxMb = 60, // for non-image files (video); photos are never refused for size, see fitImage
  label = 'Drop images here or click to upload',
  hint = 'JPG, PNG or WebP · any size (over 10 MB is shrunk automatically)',
}) {
  const maxBytes = maxMb * 1024 * 1024;
  const typeNames = types.map((t) => NAMES[t] || t).join(', ');
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState([]); // { id, name, progress, error }
  const [message, setMessage] = useState(null);

  const update = (id, patch) => setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  async function uploadOne(original, id) {
    try {
      let file = original;
      if (original.type.startsWith('image/') && original.size > MAX_IMAGE_BYTES) {
        update(id, { note: 'Shrinking to 10 MB…' });
        file = await fitImage(original);
        update(id, { note: null });
      }
      const { uploadUrl, publicUrl } = await adminService.getUploadUrl({ folder, filename: file.name, contentType: file.type });
      await putWithProgress(uploadUrl, file, (progress) => update(id, { progress }));
      update(id, { progress: 100, done: true });
      onUploaded(publicUrl || uploadUrl.split('?')[0]);
      setTimeout(() => setJobs((list) => list.filter((j) => j.id !== id)), 1200);
    } catch (err) {
      update(id, { error: err.message });
    }
  }

  function handleFiles(fileList) {
    const files = [...fileList];
    if (files.length === 0) return;
    setMessage(null);
    const accepted = [];
    const problems = [];
    for (const f of files) {
      if (!types.includes(f.type)) problems.push(`${f.name}: use ${typeNames}.`);
      else if (!f.type.startsWith('image/') && f.size > maxBytes) problems.push(`${f.name}: larger than ${maxMb} MB.`);
      else accepted.push(f);
    }
    const room = Math.max(0, maxFiles);
    if (accepted.length > room) {
      problems.push(`Only ${room} more photo${room === 1 ? '' : 's'} allowed here — the rest were skipped.`);
      accepted.length = room;
    }
    if (problems.length) setMessage(problems.join(' '));
    for (const file of accepted) {
      const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      setJobs((list) => [...list, { id, name: file.name, progress: 0 }]);
      uploadOne(file, id);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  const full = maxFiles <= 0;

  return (
    <div className="upload-zone-wrap">
      <div
        className={`upload-zone ${dragOver ? 'is-over' : ''} ${disabled || full ? 'is-disabled' : ''}`}
        role="button"
        tabIndex={disabled || full ? -1 : 0}
        aria-disabled={disabled || full}
        onClick={() => !(disabled || full) && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !(disabled || full)) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!(disabled || full)) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!(disabled || full)) handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={22} aria-hidden="true" />
        <span className="upload-zone-label">{full ? 'Maximum number of photos reached' : label}</span>
        <span className="upload-zone-hint">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept={types.join(',')}
          multiple={multiple}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
          tabIndex={-1}
        />
      </div>

      {jobs.length > 0 && (
        <ul className="upload-jobs" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.id} className={j.error ? 'has-error' : ''}>
              <span className="upload-job-name">{j.name}</span>
              {j.error ? (
                <span className="upload-job-error">{j.error}</span>
              ) : j.note ? (
                <span className="upload-job-note">{j.note}</span>
              ) : (
                <span className="upload-progress" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${j.progress}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <p className="field-error" role="alert">{message}</p>}
    </div>
  );
}

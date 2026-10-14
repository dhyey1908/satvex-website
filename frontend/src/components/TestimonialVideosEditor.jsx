import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2, Video as VideoIcon } from 'lucide-react';
import { adminService } from '../services/adminService';
import { captureVideoFrame } from '../utils/videoThumbnail';
import './TestimonialVideosEditor.css';

export const MAX_TESTIMONIAL_VIDEOS = 20;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // keeps the storefront light and uploads reliable
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// Uploads one file through the same presigned-URL flow every other admin
// upload uses, returning its public URL.
async function uploadToStorage(file, folder, contentType = file.type) {
  const { uploadUrl, publicUrl } = await adminService.getUploadUrl({
    folder,
    filename: file.name,
    contentType,
  });
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  if (!res.ok) throw new Error('Upload to storage failed.');
  return publicUrl || uploadUrl.split('?')[0];
}

let localCounter = 0;
const newLocalId = () => `vid_local_${Date.now()}_${localCounter++}`;

/**
 * Admin editor for a product's customer video testimonials: add (MP4 upload,
 * thumbnail auto-captured), edit name/caption/thumbnail, reorder, delete.
 * `videos` / `onChange` are the product form's own state — the list is saved
 * with the product (Save Product), through the normal product API.
 */
export function TestimonialVideosEditor({ videos, onChange }) {
  const videoInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [thumbBusyId, setThumbBusyId] = useState(null);

  const atLimit = videos.length >= MAX_TESTIMONIAL_VIDEOS;

  function patch(index, changes) {
    onChange(videos.map((v, i) => (i === index ? { ...v, ...changes } : v)));
  }
  function remove(index) {
    onChange(videos.filter((_, i) => i !== index));
  }
  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= videos.length) return;
    const next = [...videos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  async function handleVideoChosen(e) {
    const file = e.target.files?.[0];
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (!file) return;
    setError(null);

    if (file.type !== 'video/mp4') {
      setError('Unsupported file type. Please upload an MP4 video.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`That video is ${(file.size / (1024 * 1024)).toFixed(0)} MB. Please keep videos under 60 MB.`);
      return;
    }
    if (atLimit) {
      setError(`You can add up to ${MAX_TESTIMONIAL_VIDEOS} videos per product.`);
      return;
    }

    setUploading(true);
    try {
      setStatus('Uploading video…');
      const videoUrl = await uploadToStorage(file, 'videos', 'video/mp4');

      // A small poster image keeps the product page light — customers see
      // an image until they press play. Failure just means no poster.
      let thumbnailUrl = '';
      setStatus('Creating thumbnail…');
      const frame = await captureVideoFrame(file);
      if (frame) {
        try {
          const thumbFile = new File([frame], `${file.name.replace(/\.[^.]+$/, '')}-thumb.jpg`, { type: 'image/jpeg' });
          thumbnailUrl = await uploadToStorage(thumbFile, 'products', 'image/jpeg');
        } catch {
          thumbnailUrl = '';
        }
      }

      onChange([...videos, { id: newLocalId(), videoUrl, thumbnailUrl, customerName: '', caption: '' }]);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setStatus('');
    }
  }

  async function handleThumbChosen(index, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError('Unsupported thumbnail type. Use JPEG, PNG, WebP or AVIF.');
      return;
    }
    setError(null);
    setThumbBusyId(videos[index].id);
    try {
      const url = await uploadToStorage(file, 'products');
      patch(index, { thumbnailUrl: url });
    } catch (err) {
      setError(err.message || 'Thumbnail upload failed.');
    } finally {
      setThumbBusyId(null);
    }
  }

  return (
    <div className="tve">
      <p className="field-hint">
        Customer videos appear in a slider just above the reviews, in the order shown here. Portrait (9:16) MP4
        works best. Changes go live when you save the product.
      </p>

      {videos.length > 0 && (
        <ol className="tve-list">
          {videos.map((v, i) => (
            <li key={v.id || v.videoUrl + i} className="tve-item">
              <div className="tve-thumb">
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" />
                ) : (
                  <video src={`${v.videoUrl}#t=0.5`} muted playsInline preload="metadata" />
                )}
                <span className="tve-index">{i + 1}</span>
              </div>

              <div className="tve-fields">
                <div className="field">
                  <label htmlFor={`tve-name-${i}`}>Customer name (optional)</label>
                  <input
                    id={`tve-name-${i}`}
                    value={v.customerName || ''}
                    maxLength={60}
                    placeholder="e.g. Asha R."
                    onChange={(e) => patch(i, { customerName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`tve-caption-${i}`}>Caption (optional)</label>
                  <input
                    id={`tve-caption-${i}`}
                    value={v.caption || ''}
                    maxLength={160}
                    placeholder="e.g. Stays in place all day"
                    onChange={(e) => patch(i, { caption: e.target.value })}
                  />
                </div>
                <div className="tve-actions">
                  <label className="btn btn-ghost btn-sm tve-file">
                    {thumbBusyId === v.id ? <Loader2 size={14} className="btn-spinner" /> : <ImagePlus size={14} />}
                    {v.thumbnailUrl ? 'Replace thumbnail' : 'Add thumbnail'}
                    <input
                      type="file"
                      accept={IMAGE_TYPES.join(',')}
                      onChange={(e) => handleThumbChosen(i, e)}
                      disabled={thumbBusyId === v.id}
                    />
                  </label>
                  {v.thumbnailUrl && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch(i, { thumbnailUrl: '' })}>
                      Use video frame
                    </button>
                  )}
                </div>
              </div>

              <div className="tve-side">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move video ${i + 1} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === videos.length - 1}
                  aria-label={`Move video ${i + 1} down`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(i)}
                  aria-label={`Delete video ${i + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="tve-add">
        <label className={`btn btn-outline btn-sm tve-file ${atLimit || uploading ? 'is-disabled' : ''}`}>
          {uploading ? <Loader2 size={14} className="btn-spinner" /> : <VideoIcon size={14} />}
          {uploading ? status || 'Uploading…' : 'Add video (MP4)'}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4"
            onChange={handleVideoChosen}
            disabled={atLimit || uploading}
          />
        </label>
        <span className="tve-count" aria-live="polite">
          {videos.length} / {MAX_TESTIMONIAL_VIDEOS} videos
          {atLimit ? ' — limit reached' : ''}
        </span>
      </div>

      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

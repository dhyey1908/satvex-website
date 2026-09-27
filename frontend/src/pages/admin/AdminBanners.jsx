import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { MediaUploader } from '../../components/MediaUploader';
import { Loader } from '../../components/Loader';
import './Admin.css';

export function AdminBanners() {
  const [banners, setBanners] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newBanner, setNewBanner] = useState({ type: 'image', mediaUrl: '', link: '' });
  const { showToast } = useToast();

  useEffect(() => {
    adminService.getSettings().then((data) => setBanners(data.settings.heroBanners || []));
  }, []);

  function addBanner() {
    if (!newBanner.mediaUrl) return;
    setBanners((prev) => [...prev, { id: crypto.randomUUID(), ...newBanner, isActive: true }]);
    setNewBanner({ type: 'image', mediaUrl: '', link: '' });
  }

  function updateBanner(id, patch) {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBanner(id) {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }

  function moveBanner(index, dir) {
    setBanners((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminService.updateSettings({ heroBanners: banners });
      showToast('Banners saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!banners) return <Loader label="Loading banners…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Homepage Banners</h1>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--sp-lg)', maxWidth: '48rem' }}>
        Manage the rotating banner shown in the homepage hero. Add images or short MP4 videos, set an
        optional link (e.g. /shop or /product/butterfly), reorder slides, and toggle which ones are live.
        Changes go live once you click Save.
      </p>

      <div className="admin-form-section">
        {banners.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No banners yet — the homepage will show its default hero image.</p>}

        {banners.map((banner, index) => (
          <div key={banner.id} className="repeatable-row" style={{ alignItems: 'center' }}>
            <div style={{ width: 88, height: 56, background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
              {banner.type === 'video' ? (
                <video src={banner.mediaUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={banner.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>

            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
              <label>Link</label>
              <input
                value={banner.link || ''}
                placeholder="/shop"
                onChange={(e) => updateBanner(banner.id, { link: e.target.value })}
              />
            </div>

            <label className="checkbox-field" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={banner.isActive}
                onChange={(e) => updateBanner(banner.id, { isActive: e.target.checked })}
              />
              Active
            </label>

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveBanner(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveBanner(index, 1)} disabled={index === banners.length - 1}>↓</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBanner(banner.id)}>Remove</button>
          </div>
        ))}
      </div>

      <div className="admin-form-section">
        <h3>Add a Banner</h3>
        <div className="admin-form-row">
          <div className="field">
            <label>Type</label>
            <select
              value={newBanner.type}
              onChange={(e) => setNewBanner((prev) => ({ ...prev, type: e.target.value, mediaUrl: '' }))}
            >
              <option value="image">Image</option>
              <option value="video">Video (MP4)</option>
            </select>
          </div>
          <div className="field">
            <label>Link</label>
            <input
              value={newBanner.link}
              placeholder="/shop"
              onChange={(e) => setNewBanner((prev) => ({ ...prev, link: e.target.value }))}
            />
          </div>
        </div>

        <div className="field">
          <label>{newBanner.type === 'video' ? 'Upload Video' : 'Upload Image'}</label>
          <MediaUploader
            folder="banners"
            kind={newBanner.type}
            onUploaded={(url) => setNewBanner((prev) => ({ ...prev, mediaUrl: url }))}
          />
          {newBanner.mediaUrl && (
            <div style={{ marginTop: 12, width: 160, height: 100, background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {newBanner.type === 'video' ? (
                <video src={newBanner.mediaUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={newBanner.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          )}
        </div>

        <button type="button" className="btn btn-outline" onClick={addBanner} disabled={!newBanner.mediaUrl}>
          + Add Banner
        </button>
      </div>
    </div>
  );
}

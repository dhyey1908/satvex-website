import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { ImageUploader } from '../../components/ImageUploader';
import { Loader } from '../../components/Loader';
import './Admin.css';

export function AdminSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { refresh: refreshSettings } = useSettings();

  useEffect(() => {
    adminService.getSettings().then((data) => setForm(data.settings));
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings } = await adminService.updateSettings(form);
      setForm(settings);
      await refreshSettings();
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <Loader label="Loading settings…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Settings</h1>
      </div>
      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <div className="field">
          <label>Logo</label>
          {form.logoUrl && (
            <div style={{ marginBottom: 12, padding: 12, background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
              <img src={form.logoUrl} alt="Current logo" height="40" />
            </div>
          )}
          <ImageUploader folder="branding" onUploaded={(url) => setField('logoUrl', url)} />
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Shown in the site header and footer. Upload a transparent PNG for best results.
          </p>
        </div>
        <div className="field">
          <label htmlFor="brandName">Brand Name</label>
          <input id="brandName" value={form.brandName} onChange={(e) => setField('brandName', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contactPhone">Contact Phone</label>
          <input id="contactPhone" value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contactEmail">Contact Email</label>
          <input
            id="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setField('contactEmail', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="instagramUrl">Instagram URL</label>
          <input id="instagramUrl" value={form.instagramUrl} onChange={(e) => setField('instagramUrl', e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

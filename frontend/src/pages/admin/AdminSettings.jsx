import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { ImageUploader } from '../../components/ImageUploader';
import { Loader } from '../../components/Loader';
import { email as validateEmail, url as validateUrl, maxLength, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import './Admin.css';

function validate(values) {
  return runValidators({
    brandName: () => maxLength(values.brandName, 60, 'Brand name'),
    contactPhone: () => maxLength(values.contactPhone, 20, 'Contact phone'),
    contactEmail: () => validateEmail(values.contactEmail, { optional: true }),
    instagramUrl: () => validateUrl(values.instagramUrl, { optional: true }),
  });
}

export function AdminSettings() {
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { refresh: refreshSettings } = useSettings();

  useEffect(() => {
    adminService.getSettings().then((data) => setForm(data.settings));
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function setPillarField(index, key, value) {
    setForm((prev) => ({
      ...prev,
      whyPillars: prev.whyPillars.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ brandName: true, contactPhone: true, contactEmail: true, instagramUrl: true });
    if (hasErrors(errors)) return;

    setSaving(true);
    try {
      const { settings } = await adminService.updateSettings(form);
      setForm(settings);
      await refreshSettings();
      showToast('Settings saved', 'success');
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else showToast(err.message, 'error');
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
      <form className="admin-form admin-form-wide" onSubmit={handleSubmit} noValidate>
        <div className="admin-form-section">
          <h3>Brand</h3>
          <div className="admin-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
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
            <div className={`field ${touched.brandName && fieldErrors.brandName ? 'invalid' : ''}`}>
              <label htmlFor="brandName">Brand Name</label>
              <input
                id="brandName"
                value={form.brandName}
                onChange={(e) => setField('brandName', e.target.value)}
                onBlur={() => markTouched('brandName')}
              />
              {touched.brandName && fieldErrors.brandName && <p className="field-error">{fieldErrors.brandName}</p>}
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Site Images</h3>
          <div className="admin-form-grid">
            <div className="field">
              <label>Sign In / Create Account Page Image</label>
              {form.authImage && (
                <div style={{ marginBottom: 12, width: 160, height: 128, background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <img src={form.authImage} alt="Sign-in page" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <ImageUploader folder="branding" onUploaded={(url) => setField('authImage', url)} />
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Shown beside the sign in / create account form. Leave empty to fall back to a product photo. See IMAGE_GUIDE.md for the recommended size.
              </p>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>About Page Image</label>
              {form.aboutImage && (
                <div style={{ marginBottom: 12, width: 160, height: 128, background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <img src={form.aboutImage} alt="About page" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <ImageUploader folder="branding" onUploaded={(url) => setField('aboutImage', url)} />
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Shown on the About page hero. Leave empty to fall back to a product photo. See IMAGE_GUIDE.md for the recommended size.
              </p>
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Why Satvex — Homepage &amp; About Pillars</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Shown as 4 cards on the Homepage and About page. Fill in real, specific claims
            (materials, testing, durability) rather than generic marketing language.
          </p>
          {form.whyPillars.map((pillar, i) => (
            <div key={i} className="repeatable-row">
              <div className="field">
                <label>Title {i + 1}</label>
                <input value={pillar.title} onChange={(e) => setPillarField(i, 'title', e.target.value)} />
              </div>
              <div className="field">
                <label>Description {i + 1}</label>
                <input
                  value={pillar.description}
                  onChange={(e) => setPillarField(i, 'description', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="admin-form-section">
          <h3>Contact Info</h3>
          <div className="admin-form-grid">
            <div className={`field ${touched.contactPhone && fieldErrors.contactPhone ? 'invalid' : ''}`}>
              <label htmlFor="contactPhone">Contact Phone</label>
              <input
                id="contactPhone"
                value={form.contactPhone}
                onChange={(e) => setField('contactPhone', e.target.value)}
                onBlur={() => markTouched('contactPhone')}
              />
              {touched.contactPhone && fieldErrors.contactPhone && <p className="field-error">{fieldErrors.contactPhone}</p>}
            </div>
            <div className={`field ${touched.contactEmail && fieldErrors.contactEmail ? 'invalid' : ''}`}>
              <label htmlFor="contactEmail">Contact Email</label>
              <input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(e) => setField('contactEmail', e.target.value)}
                onBlur={() => markTouched('contactEmail')}
              />
              {touched.contactEmail && fieldErrors.contactEmail && <p className="field-error">{fieldErrors.contactEmail}</p>}
            </div>
            <div className={`field ${touched.instagramUrl && fieldErrors.instagramUrl ? 'invalid' : ''}`}>
              <label htmlFor="instagramUrl">Instagram URL</label>
              <input
                id="instagramUrl"
                value={form.instagramUrl}
                onChange={(e) => setField('instagramUrl', e.target.value)}
                onBlur={() => markTouched('instagramUrl')}
              />
              {touched.instagramUrl && fieldErrors.instagramUrl && <p className="field-error">{fieldErrors.instagramUrl}</p>}
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

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

  function setNestedField(group, key, value) {
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  }

  function setShippingTierField(index, key, value) {
    setForm((prev) => {
      const tiers = [...(prev.shipping?.tiers || [])];
      tiers[index] = { ...tiers[index], [key]: value };
      return { ...prev, shipping: { ...prev.shipping, tiers } };
    });
  }

  function addShippingTier() {
    setForm((prev) => {
      const tiers = [...(prev.shipping?.tiers || [])];
      const last = tiers[tiers.length - 1];
      tiers[tiers.length - 1] = { ...last, maxSubtotal: last?.maxSubtotal ?? 0 };
      tiers.push({ minSubtotal: (last?.maxSubtotal ?? 0) + 0.01, maxSubtotal: null, charge: 0 });
      return { ...prev, shipping: { ...prev.shipping, tiers } };
    });
  }

  function removeShippingTier(index) {
    setForm((prev) => {
      const tiers = (prev.shipping?.tiers || []).filter((_, i) => i !== index);
      return { ...prev, shipping: { ...prev.shipping, tiers } };
    });
  }

  function setShiprocketPackageField(key, value) {
    setForm((prev) => ({
      ...prev,
      shiprocket: {
        ...prev.shiprocket,
        defaultPackage: { ...prev.shiprocket?.defaultPackage, [key]: value },
      },
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

        <div className="admin-form-section">
          <h3>Tax (GST)</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.tax?.enabled ?? true}
              onChange={(e) => setNestedField('tax', 'enabled', e.target.checked)}
            />
            Enable GST
          </label>
          {form.tax?.enabled && (
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="gstPercent">GST Percentage (%)</label>
              <input
                id="gstPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.tax?.percent ?? 18}
                onChange={(e) => setNestedField('tax', 'percent', Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="admin-form-section">
          <h3>Shipping</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.shipping?.enabled ?? true}
              onChange={(e) => setNestedField('shipping', 'enabled', e.target.checked)}
            />
            Enable Shipping Charges
          </label>
          {form.shipping?.enabled && (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Store-wide tiers by cart subtotal (not per-product). The last tier's "Up To" can be
                left blank to mean "and above."
              </p>
              {(form.shipping?.tiers || []).map((tier, i) => (
                <div key={i} className="repeatable-row" style={{ gap: 8, alignItems: 'flex-end' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`tierMin${i}`}>From (₹)</label>
                    <input
                      id={`tierMin${i}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.minSubtotal ?? 0}
                      onChange={(e) => setShippingTierField(i, 'minSubtotal', Number(e.target.value))}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`tierMax${i}`}>Up To (₹)</label>
                    <input
                      id={`tierMax${i}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.maxSubtotal ?? ''}
                      onChange={(e) =>
                        setShippingTierField(i, 'maxSubtotal', e.target.value === '' ? null : Number(e.target.value))
                      }
                      placeholder="and above"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`tierCharge${i}`}>Charge (₹)</label>
                    <input
                      id={`tierCharge${i}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.charge ?? 0}
                      onChange={(e) => setShippingTierField(i, 'charge', Number(e.target.value))}
                    />
                  </div>
                  {(form.shipping?.tiers || []).length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeShippingTier(i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addShippingTier}>
                Add Tier
              </button>
            </div>
          )}
        </div>

        <div className="admin-form-section">
          <h3>Cash on Delivery</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.cod?.enabled ?? true}
              onChange={(e) => setNestedField('cod', 'enabled', e.target.checked)}
            />
            Enable COD Extra Charge
          </label>
          {form.cod?.enabled && (
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="codCharge">COD Charge (₹)</label>
              <input
                id="codCharge"
                type="number"
                min="0"
                step="0.01"
                value={form.cod?.charge ?? 0}
                onChange={(e) => setNestedField('cod', 'charge', Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="admin-form-section">
          <h3>Online Payments (Cashfree)</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.payments?.onlineEnabled ?? false}
              onChange={(e) => setNestedField('payments', 'onlineEnabled', e.target.checked)}
            />
            Show Online Payment to all customers
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
            Keep this off while testing with Cashfree sandbox keys — it must never be reachable by
            real customers until real payments are confirmed working end to end (see the
            live-cutover checklist in 18-payment-gateway.md).
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="onlineTestUserIds">Test User IDs (one per line)</label>
            <textarea
              id="onlineTestUserIds"
              rows={3}
              value={(form.payments?.onlineTestUserIds || []).join('\n')}
              onChange={(e) =>
                setNestedField(
                  'payments',
                  'onlineTestUserIds',
                  e.target.value.split('\n').map((v) => v.trim()).filter(Boolean)
                )
              }
              placeholder="userId1&#10;userId2"
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              These accounts see and can use Online Payment even while the toggle above is off —
              use this to test the real Cashfree sandbox flow without exposing it publicly.
            </p>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>GoKwik Checkout (sandbox)</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.payments?.gokwikEnabled ?? false}
              onChange={(e) => setNestedField('payments', 'gokwikEnabled', e.target.checked)}
            />
            Route all customers through GoKwik instead of Cashfree
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
            Keep this off — GoKwik is unverified sandbox-only (see gokwik_integration_notes.md). Use the
            test user IDs below instead. An allowlisted account's checkout (COD and Online both) goes
            entirely through GoKwik, bypassing Cashfree completely.
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="gokwikTestUserIds">Test User IDs (one per line)</label>
            <textarea
              id="gokwikTestUserIds"
              rows={3}
              value={(form.payments?.gokwikTestUserIds || []).join('\n')}
              onChange={(e) =>
                setNestedField(
                  'payments',
                  'gokwikTestUserIds',
                  e.target.value.split('\n').map((v) => v.trim()).filter(Boolean)
                )
              }
              placeholder="userId1&#10;userId2"
            />
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              These accounts&apos; checkout (COD and Online) goes through GoKwik instead of Cashfree,
              invisible to everyone else.
            </p>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Shiprocket Shipping</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.shiprocket?.enabled ?? false}
              onChange={(e) => setNestedField('shiprocket', 'enabled', e.target.checked)}
            />
            Create Shiprocket shipments automatically on order confirmation
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
            Keep this off until a real Shiprocket pickup location and credentials are confirmed
            (see shiprocket_integration_notes.md). While off, orders are never sent to Shiprocket
            and no retry job is queued.
          </p>
          <div className="field">
            <label htmlFor="shiprocketPickupLocation">Pickup Location (as named in Shiprocket)</label>
            <input
              id="shiprocketPickupLocation"
              type="text"
              value={form.shiprocket?.pickupLocation ?? ''}
              onChange={(e) => setNestedField('shiprocket', 'pickupLocation', e.target.value)}
              placeholder="e.g. Primary Warehouse"
            />
          </div>
          <p style={{ fontSize: '0.85rem', margin: '12px 0 4px' }}>Default Package Dimensions</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field">
              <label htmlFor="srLength">Length (cm)</label>
              <input
                id="srLength"
                type="number"
                step="0.1"
                value={form.shiprocket?.defaultPackage?.lengthCm ?? ''}
                onChange={(e) => setShiprocketPackageField('lengthCm', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="srBreadth">Breadth (cm)</label>
              <input
                id="srBreadth"
                type="number"
                step="0.1"
                value={form.shiprocket?.defaultPackage?.breadthCm ?? ''}
                onChange={(e) => setShiprocketPackageField('breadthCm', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="srHeight">Height (cm)</label>
              <input
                id="srHeight"
                type="number"
                step="0.1"
                value={form.shiprocket?.defaultPackage?.heightCm ?? ''}
                onChange={(e) => setShiprocketPackageField('heightCm', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="srWeight">Weight (kg)</label>
              <input
                id="srWeight"
                type="number"
                step="0.01"
                value={form.shiprocket?.defaultPackage?.weightKg ?? ''}
                onChange={(e) => setShiprocketPackageField('weightKg', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="admin-form-sticky-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

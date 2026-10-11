import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import { ImageUploader } from '../../components/ImageUploader';
import { Loader } from '../../components/Loader';
import { email as validateEmail, url as validateUrl, maxLength, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import { INDIAN_STATES } from '../../constants/indianStates';
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
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const { showToast } = useToast();
  const { refresh: refreshSettings } = useSettings();

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const result = await adminService.testShiprocketConnection();
      setConnectionResult(result);
    } catch (err) {
      setConnectionResult({ ok: false, step: 'request', message: err.message });
    } finally {
      setTestingConnection(false);
    }
  }

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

  function toggleDeliveryState(state) {
    setForm((prev) => {
      const current = prev.delivery?.enabledStates || [];
      const next = current.includes(state) ? current.filter((s) => s !== state) : [...current, state];
      return { ...prev, delivery: { ...prev.delivery, enabledStates: next } };
    });
  }

  function setShiprocketPackageField(key, value) {
    setForm((prev) => ({
      ...prev,
      shiprocket: { ...prev.shiprocket, defaultPackage: { ...prev.shiprocket?.defaultPackage, [key]: value } },
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
          <h3>Shiprocket Connection</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.shiprocket?.enabled ?? false}
              onChange={(e) => setNestedField('shiprocket', 'enabled', e.target.checked)}
            />
            Use real Shiprocket rates for shipping (off = always use the fallback flat charge below)
          </label>
          <div className="admin-form-grid" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="pickupPincode">Pickup Pincode (Rajkot)</label>
              <input
                id="pickupPincode"
                type="text"
                maxLength={6}
                value={form.shiprocket?.pickupPincode ?? ''}
                onChange={(e) => setNestedField('shiprocket', 'pickupPincode', e.target.value)}
                placeholder="e.g. 360001"
              />
            </div>
            <div className="field">
              <label htmlFor="pickupLocation">Pickup Location Nickname</label>
              <input
                id="pickupLocation"
                type="text"
                value={form.shiprocket?.pickupLocation ?? ''}
                onChange={(e) => setNestedField('shiprocket', 'pickupLocation', e.target.value)}
                placeholder="Must match Shiprocket panel exactly"
              />
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Pickup Location Nickname must exactly match a pickup address already created in the Shiprocket panel
            (Settings → Pickup Addresses) — used when actually booking a shipment. Pickup Pincode is separate, used
            only for rate quotes. Keep the toggle off until both are confirmed — shipping still works while off,
            using the flat fallback charge below, and no shipment is ever booked.
          </p>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleTestConnection} disabled={testingConnection}>
              {testingConnection ? 'Testing…' : 'Test Shiprocket Connection'}
            </button>
            {connectionResult && (
              <p
                style={{
                  fontSize: '0.85rem',
                  marginTop: 6,
                  color: connectionResult.ok ? 'var(--color-success, green)' : 'var(--color-danger, crimson)',
                }}
              >
                {connectionResult.ok
                  ? '✓ Connected — login and serviceability lookup both succeeded.'
                  : `✗ Failed at ${connectionResult.step}: ${connectionResult.message}`}
              </p>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Logs in and runs one read-only rate lookup — never creates or modifies anything in your Shiprocket
              account.
            </p>
          </div>

          <p style={{ fontSize: '0.85rem', margin: '12px 0 4px' }}>Default Package (every order ships under 500g)</p>
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
              <label htmlFor="srWeight">Weight (kg, max 0.5)</label>
              <input
                id="srWeight"
                type="number"
                step="0.01"
                max="0.5"
                value={form.shiprocket?.defaultPackage?.weightKg ?? ''}
                onChange={(e) => setShiprocketPackageField('weightKg', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Dynamic Shipping (Shiprocket rate)</h3>
          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="handlingMargin">Handling Margin (₹)</label>
              <input
                id="handlingMargin"
                type="number"
                min="0"
                step="0.01"
                value={form.shipping?.handlingMargin ?? 0}
                onChange={(e) => setNestedField('shipping', 'handlingMargin', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="minCharge">Minimum Charge (₹)</label>
              <input
                id="minCharge"
                type="number"
                min="0"
                step="0.01"
                value={form.shipping?.minCharge ?? 0}
                onChange={(e) => setNestedField('shipping', 'minCharge', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="maxCharge">Maximum Cap (₹, optional)</label>
              <input
                id="maxCharge"
                type="number"
                min="0"
                step="0.01"
                value={form.shipping?.maxCharge ?? ''}
                onChange={(e) =>
                  setNestedField('shipping', 'maxCharge', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="Leave blank for no cap"
              />
            </div>
            <div className="field">
              <label htmlFor="roundTo">Round To</label>
              <select
                id="roundTo"
                value={form.shipping?.roundTo ?? 1}
                onChange={(e) => setNestedField('shipping', 'roundTo', Number(e.target.value))}
              >
                <option value={1}>Nearest ₹1</option>
                <option value={5}>Nearest ₹5</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fallbackFlatCharge">Fallback Flat Charge (₹)</label>
              <input
                id="fallbackFlatCharge"
                type="number"
                min="0"
                step="0.01"
                value={form.shipping?.fallbackFlatCharge ?? 59}
                onChange={(e) => setNestedField('shipping', 'fallbackFlatCharge', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="freeThreshold">Free Shipping Above (₹)</label>
              <input
                id="freeThreshold"
                type="number"
                min="0"
                step="0.01"
                value={form.shipping?.freeThreshold ?? 700}
                onChange={(e) => setNestedField('shipping', 'freeThreshold', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="courierSelectionRule">Courier Selection Rule</label>
              <select
                id="courierSelectionRule"
                value={form.shipping?.courierSelectionRule ?? 'lowest_rate'}
                onChange={(e) => setNestedField('shipping', 'courierSelectionRule', e.target.value)}
              >
                <option value="lowest_rate">Lowest Rate</option>
                <option value="fastest">Fastest (by ETD)</option>
              </select>
            </div>
          </div>
          <label className="checkbox-field" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={form.shipping?.rateIncludesGst ?? false}
              onChange={(e) => setNestedField('shipping', 'rateIncludesGst', e.target.checked)}
            />
            Shiprocket&apos;s rate already includes GST (don&apos;t add it again)
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.shipping?.rateIncludesCodCharge ?? false}
              onChange={(e) => setNestedField('shipping', 'rateIncludesCodCharge', e.target.checked)}
            />
            Shiprocket&apos;s COD rate already includes their COD handling charge (skip our flat COD fee)
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Both checkboxes above are unconfirmed until a real Shiprocket response is checked (run{' '}
            <code>scripts/shiprocket-sample-rate.js</code>) — leave them off until then.
          </p>
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
          <div className="admin-form-grid" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="prepaidDiscountType">Prepaid Discount</label>
              <select
                id="prepaidDiscountType"
                value={form.cod?.prepaidDiscountType ?? 'none'}
                onChange={(e) => setNestedField('cod', 'prepaidDiscountType', e.target.value)}
              >
                <option value="none">None</option>
                <option value="percentage">Percentage</option>
                <option value="flat">Flat (₹)</option>
              </select>
            </div>
            {form.cod?.prepaidDiscountType && form.cod.prepaidDiscountType !== 'none' && (
              <div className="field">
                <label htmlFor="prepaidDiscountValue">
                  Discount Value {form.cod.prepaidDiscountType === 'percentage' ? '(%)' : '(₹)'}
                </label>
                <input
                  id="prepaidDiscountValue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cod?.prepaidDiscountValue ?? 0}
                  onChange={(e) => setNestedField('cod', 'prepaidDiscountValue', Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Online Payments (PayU)</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.payments?.onlineEnabled ?? false}
              onChange={(e) => setNestedField('payments', 'onlineEnabled', e.target.checked)}
            />
            Show Online Payment to all customers
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
            Keep this off while testing with PayU test keys — it must never be reachable by
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
              use this to test the real PayU test flow without exposing it publicly.
            </p>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Delivery Eligibility</h3>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.delivery?.enabled ?? false}
              onChange={(e) => setNestedField('delivery', 'enabled', e.target.checked)}
            />
            Restrict delivery to selected states only
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
            Off by default — every pincode is deliverable, same as today. Turn this on to allow
            orders only to the states checked below; a state left unchecked is not deliverable,
            even if the customer enters a valid pincode for it. The pincode's state is always
            resolved independently on the backend, never trusted from the address form itself, and
            is re-checked again right before an order is placed.
          </p>
          {form.delivery?.enabled && (
            <div className="admin-form-grid">
              {INDIAN_STATES.map((state) => (
                <label key={state} className="checkbox-field" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={(form.delivery?.enabledStates || []).includes(state)}
                    onChange={() => toggleDeliveryState(state)}
                  />
                  {state}
                </label>
              ))}
            </div>
          )}
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

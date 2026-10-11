import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { minLength, phone as validatePhone, sanitizePhoneInput, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import './Account.css';

function validate(values) {
  return runValidators({
    name: () => minLength(values.name, 2, 'Full name'),
    phone: () => validatePhone(values.phone, { optional: true }),
  });
}

export function AccountProfile() {
  useDocumentMeta({ title: 'Profile', path: '/account/profile' });

  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ name: true, phone: true });
    if (hasErrors(errors)) return;

    setSaving(true);
    try {
      await authService.updateProfile(form);
      await refreshUser();
      showToast('Profile updated', 'success');
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-headline-lg">Profile</h1>
      <form className="account-form" onSubmit={handleSubmit} style={{ marginTop: 20 }} noValidate>
        <div className={`field ${touched.name && fieldErrors.name ? 'invalid' : ''}`}>
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            onBlur={() => markTouched('name')}
          />
          {touched.name && fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
        </div>
        <div className={`field ${touched.phone && fieldErrors.phone ? 'invalid' : ''}`}>
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            onChange={(e) => setField('phone', sanitizePhoneInput(e.target.value))}
            onBlur={() => markTouched('phone')}
          />
          {touched.phone && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="field">
          <label>Email</label>
          <input value={user?.email || 'Not set'} disabled />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

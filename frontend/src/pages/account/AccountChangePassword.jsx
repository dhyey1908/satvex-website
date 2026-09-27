import { useState } from 'react';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { PasswordStrength } from '../../components/PasswordStrength';
import { required, password as validatePassword, passwordsMatch, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import './Account.css';

function validate(values) {
  return runValidators({
    currentPassword: () => required(values.currentPassword, 'Current password'),
    newPassword: () => validatePassword(values.newPassword),
    confirmPassword: () => passwordsMatch(values.confirmPassword, values.newPassword),
  });
}

export function AccountChangePassword() {
  useDocumentMeta({ title: 'Change Password', path: '/account/change-password' });

  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    if (key === 'newPassword' && fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: passwordsMatch(form.confirmPassword, value) }));
    }
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ currentPassword: true, newPassword: true, confirmPassword: true });
    if (hasErrors(errors)) return;

    setSaving(true);
    try {
      await authService.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTouched({});
      showToast('Password updated', 'success');
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-headline-lg">Change Password</h1>
      <form className="account-form" onSubmit={handleSubmit} style={{ marginTop: 20 }} noValidate>
        <div className={`field ${touched.currentPassword && fieldErrors.currentPassword ? 'invalid' : ''}`}>
          <label htmlFor="currentPassword">Current Password</label>
          <input
            id="currentPassword"
            type="password"
            required
            value={form.currentPassword}
            onChange={(e) => setField('currentPassword', e.target.value)}
            onBlur={() => markTouched('currentPassword')}
          />
          {touched.currentPassword && fieldErrors.currentPassword && (
            <p className="field-error">{fieldErrors.currentPassword}</p>
          )}
        </div>
        <div className={`field ${touched.newPassword && fieldErrors.newPassword ? 'invalid' : ''}`}>
          <label htmlFor="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={form.newPassword}
            onChange={(e) => setField('newPassword', e.target.value)}
            onBlur={() => markTouched('newPassword')}
          />
          <PasswordStrength password={form.newPassword} />
          {touched.newPassword && fieldErrors.newPassword && <p className="field-error">{fieldErrors.newPassword}</p>}
        </div>
        <div className={`field ${touched.confirmPassword && fieldErrors.confirmPassword ? 'invalid' : ''}`}>
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            onBlur={() => markTouched('confirmPassword')}
          />
          {touched.confirmPassword && fieldErrors.confirmPassword && (
            <p className="field-error">{fieldErrors.confirmPassword}</p>
          )}
        </div>
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

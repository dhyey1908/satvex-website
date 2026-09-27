import { useState } from 'react';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { PasswordStrength } from '../../components/PasswordStrength';
import './Account.css';

export function AccountChangePassword() {
  useDocumentMeta({ title: 'Change Password', path: '/account/change-password' });

  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const mismatch = form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password updated', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-headline-lg">Change Password</h1>
      <form className="account-form" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="currentPassword">Current Password</label>
          <input
            id="currentPassword"
            type="password"
            required
            value={form.currentPassword}
            onChange={(e) => setField('currentPassword', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={form.newPassword}
            onChange={(e) => setField('newPassword', e.target.value)}
          />
          <PasswordStrength password={form.newPassword} />
        </div>
        <div className={`field ${mismatch ? 'invalid' : ''}`}>
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
          />
          {mismatch && <p className="field-error">Passwords do not match.</p>}
        </div>
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

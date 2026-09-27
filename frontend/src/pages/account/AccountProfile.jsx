import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import './Account.css';

export function AccountProfile() {
  useDocumentMeta({ title: 'Profile', path: '/account/profile' });

  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await authService.updateProfile(form);
      await refreshUser();
      showToast('Profile updated', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-headline-lg">Profile</h1>
      <form className="account-form" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="name">Full Name</label>
          <input id="name" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={user?.email} disabled />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

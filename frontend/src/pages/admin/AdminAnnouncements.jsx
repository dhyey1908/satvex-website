import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import './Admin.css';

const MAX_ANNOUNCEMENTS = 5;
const EMPTY_NEW = { message: '', link: '', couponCode: '', startDate: '', endDate: '' };

export function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ ...EMPTY_NEW });
  const { showToast } = useToast();

  useEffect(() => {
    adminService.getSettings().then((data) => setAnnouncements(data.settings.announcements || []));
  }, []);

  function addAnnouncement() {
    if (!newAnnouncement.message.trim() || announcements.length >= MAX_ANNOUNCEMENTS) return;
    setAnnouncements((prev) => [...prev, { id: crypto.randomUUID(), ...newAnnouncement, isActive: true }]);
    setNewAnnouncement({ ...EMPTY_NEW });
  }

  function updateAnnouncement(id, patch) {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAnnouncement(id) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }

  function moveAnnouncement(index, dir) {
    setAnnouncements((prev) => {
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
      await adminService.updateSettings({ announcements });
      showToast('Announcements saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!announcements) return <Loader label="Loading announcements…" />;

  const atLimit = announcements.length >= MAX_ANNOUNCEMENTS;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Announcement Bar</h1>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--sp-lg)', maxWidth: '48rem' }}>
        Manage the rotating announcement strip shown above the header on every public page. Up to {MAX_ANNOUNCEMENTS}{' '}
        messages, reorder them, and toggle which are live. A coupon code attached to a message only ever shows once
        that coupon is actually active and valid — it's never implied otherwise. Changes go live once you click Save.
      </p>

      <div className="admin-form-section">
        {announcements.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)' }}>No announcements yet — the bar won&apos;t show on the site.</p>
        )}

        {announcements.map((a, index) => (
          <div key={a.id} className="repeatable-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0, flex: '2 1 220px' }}>
              <label>Message</label>
              <input
                value={a.message}
                maxLength={140}
                placeholder="e.g. Free Shipping on Eligible Orders"
                onChange={(e) => updateAnnouncement(a.id, { message: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label>Link (optional)</label>
              <input
                value={a.link || ''}
                placeholder="/shop"
                onChange={(e) => updateAnnouncement(a.id, { link: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 120px' }}>
              <label>Coupon Code (optional)</label>
              <input
                value={a.couponCode || ''}
                placeholder="SATVEX10"
                onChange={(e) => updateAnnouncement(a.id, { couponCode: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 130px' }}>
              <label>Start Date (optional)</label>
              <input
                type="date"
                value={a.startDate || ''}
                onChange={(e) => updateAnnouncement(a.id, { startDate: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 130px' }}>
              <label>End Date (optional)</label>
              <input
                type="date"
                value={a.endDate || ''}
                onChange={(e) => updateAnnouncement(a.id, { endDate: e.target.value })}
              />
            </div>

            <label className="checkbox-field" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={a.isActive}
                onChange={(e) => updateAnnouncement(a.id, { isActive: e.target.checked })}
              />
              Active
            </label>

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveAnnouncement(index, -1)} disabled={index === 0} aria-label="Move up"><ChevronUp size={16} /></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveAnnouncement(index, 1)} disabled={index === announcements.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAnnouncement(a.id)}><Trash2 size={14} /> Remove</button>
          </div>
        ))}
      </div>

      <div className="admin-form-section">
        <h3>Add an Announcement</h3>
        {atLimit && (
          <p style={{ color: 'var(--color-warning)', fontSize: '0.85rem' }}>
            You've reached the {MAX_ANNOUNCEMENTS}-message limit — remove one to add another.
          </p>
        )}
        <div className="admin-form-row">
          <div className="field">
            <label>Message</label>
            <input
              value={newAnnouncement.message}
              maxLength={140}
              placeholder="e.g. Navratri Special — Celebrate in Style"
              onChange={(e) => setNewAnnouncement((prev) => ({ ...prev, message: e.target.value }))}
              disabled={atLimit}
            />
          </div>
          <div className="field">
            <label>Link (optional)</label>
            <input
              value={newAnnouncement.link}
              placeholder="/shop"
              onChange={(e) => setNewAnnouncement((prev) => ({ ...prev, link: e.target.value }))}
              disabled={atLimit}
            />
          </div>
        </div>
        <div className="admin-form-row">
          <div className="field">
            <label>Coupon Code (optional)</label>
            <input
              value={newAnnouncement.couponCode}
              placeholder="SATVEX10"
              onChange={(e) => setNewAnnouncement((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
              disabled={atLimit}
            />
          </div>
          <div className="field">
            <label>Start Date (optional)</label>
            <input
              type="date"
              value={newAnnouncement.startDate}
              onChange={(e) => setNewAnnouncement((prev) => ({ ...prev, startDate: e.target.value }))}
              disabled={atLimit}
            />
          </div>
          <div className="field">
            <label>End Date (optional)</label>
            <input
              type="date"
              value={newAnnouncement.endDate}
              onChange={(e) => setNewAnnouncement((prev) => ({ ...prev, endDate: e.target.value }))}
              disabled={atLimit}
            />
          </div>
        </div>

        <button type="button" className="btn btn-outline" onClick={addAnnouncement} disabled={atLimit || !newAnnouncement.message.trim()}>
          <Plus size={16} /> Add Announcement
        </button>
      </div>
    </div>
  );
}

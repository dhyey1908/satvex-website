import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../../components/Modal';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

const EMPTY_FORM = { code: '', discountType: 'percentage', discountValue: '', isActive: true, usageLimit: '' };

export function AdminCoupons() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [coupons, setCoupons] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    adminService.getCoupons().then((data) => setCoupons(data.coupons));
  }

  useEffect(load, []);

  function openNew() {
    setEditingCode(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(coupon) {
    setEditingCode(coupon.code);
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      isActive: coupon.isActive,
      usageLimit: coupon.usageLimit || '',
    });
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      isActive: form.isActive,
      ...(form.usageLimit ? { usageLimit: Number(form.usageLimit) } : {}),
    };
    try {
      if (editingCode) {
        await adminService.updateCoupon(editingCode, payload);
      } else {
        await adminService.createCoupon({ ...payload, code: form.code });
      }
      setModalOpen(false);
      load();
      showToast('Coupon saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(code) {
    const ok = await confirm({
      title: `Delete coupon "${code}"?`,
      message: 'This coupon will no longer be redeemable. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminService.deleteCoupon(code);
      load();
      showToast('Coupon deleted', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!coupons) return <Loader label="Loading coupons…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Coupons</h1>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Add Coupon
        </button>
      </div>

      {coupons.length === 0 ? (
        <EmptyState title="No coupons yet" />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Usage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td>
                    <span className={`pill ${c.isActive ? 'pill-active' : 'pill-inactive'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.code)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingCode ? 'Edit Coupon' : 'Add Coupon'}>
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Code</label>
            <input
              required
              disabled={Boolean(editingCode)}
              value={form.code}
              onChange={(e) => setField('code', e.target.value.toUpperCase())}
              placeholder="WELCOME10"
            />
          </div>
          <div className="field">
            <label>Discount Type</label>
            <select value={form.discountType} onChange={(e) => setField('discountType', e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat Amount</option>
            </select>
          </div>
          <div className="field">
            <label>Discount Value {form.discountType === 'percentage' ? '(%)' : '(₹)'}</label>
            <input
              type="number"
              required
              min="0"
              value={form.discountValue}
              onChange={(e) => setField('discountValue', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Usage Limit</label>
            <input type="number" min="1" value={form.usageLimit} onChange={(e) => setField('usageLimit', e.target.value)} />
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
            Active
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save Coupon'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

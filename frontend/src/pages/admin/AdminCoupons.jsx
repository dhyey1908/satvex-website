import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Modal } from '../../components/Modal';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { couponCode as validateCouponCode, positiveNumber, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import './Admin.css';

const EMPTY_FORM = {
  code: '',
  discountType: 'percentage',
  discountValue: '',
  isActive: true,
  usageLimit: '',
  oneUsePerCustomer: false,
};
const PAGE_SIZE = 20;

function validate(values, { isEditing }) {
  const errors = runValidators({
    code: () => (isEditing ? '' : validateCouponCode(values.code)),
    discountValue: () => positiveNumber(values.discountValue, 'Discount value'),
    usageLimit: () => (values.usageLimit ? positiveNumber(values.usageLimit, 'Usage limit') : ''),
  });
  if (!errors.discountValue && values.discountType === 'percentage' && Number(values.discountValue) > 100) {
    errors.discountValue = 'A percentage discount cannot be more than 100.';
  }
  return errors;
}

export function AdminCoupons() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [coupons, setCoupons] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [historyCode, setHistoryCode] = useState(null);
  const [redemptions, setRedemptions] = useState(null);

  function load() {
    adminService.getCoupons().then((data) => setCoupons(data.coupons));
  }

  useEffect(load, []);

  const { page, setPage, totalPages, pageItems: pageCoupons, total: totalCoupons, rangeStart, rangeEnd } =
    usePagination(coupons, PAGE_SIZE);

  function openNew() {
    setEditingCode(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setTouched({});
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
      oneUsePerCustomer: coupon.oneUsePerCustomer || false,
    });
    setFieldErrors({});
    setTouched({});
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const errors = validate(form, { isEditing: Boolean(editingCode) });
    setFieldErrors(errors);
    setTouched({ code: true, discountValue: true, usageLimit: true });
    if (hasErrors(errors)) return;

    setSaving(true);
    const payload = {
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      isActive: form.isActive,
      oneUsePerCustomer: form.oneUsePerCustomer,
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
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else showToast(err.message, 'error');
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

  function openHistory(code) {
    setHistoryCode(code);
    setRedemptions(null);
    adminService
      .getCouponRedemptions(code)
      .then((data) => setRedemptions(data.redemptions))
      .catch(() => setRedemptions([]));
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
                <th>Per Customer</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageCoupons.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(c.code)}>
                      {c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </button>
                  </td>
                  <td>{c.oneUsePerCustomer ? 'One use' : 'Unlimited'}</td>
                  <td>
                    <span className={`pill ${c.isActive ? 'pill-active' : 'pill-inactive'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(c.code)}>
                      <Users size={14} /> Usage
                    </button>
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
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalCoupons}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="coupons"
          />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingCode ? 'Edit Coupon' : 'Add Coupon'}>
        <form onSubmit={handleSave} noValidate>
          <div className={`field ${touched.code && fieldErrors.code ? 'invalid' : ''}`}>
            <label>Code</label>
            <input
              required
              disabled={Boolean(editingCode)}
              value={form.code}
              onChange={(e) => setField('code', e.target.value.toUpperCase())}
              onBlur={() => markTouched('code')}
              placeholder="WELCOME10"
            />
            {touched.code && fieldErrors.code && <p className="field-error">{fieldErrors.code}</p>}
          </div>
          <div className="field">
            <label>Discount Type</label>
            <select
              value={form.discountType}
              onChange={(e) => {
                setField('discountType', e.target.value);
                if (fieldErrors.discountValue) setFieldErrors((prev) => ({ ...prev, discountValue: '' }));
              }}
            >
              <option value="percentage">Percentage</option>
              <option value="flat">Flat Amount</option>
            </select>
          </div>
          <div className={`field ${touched.discountValue && fieldErrors.discountValue ? 'invalid' : ''}`}>
            <label>Discount Value {form.discountType === 'percentage' ? '(%)' : '(₹)'}</label>
            <input
              type="number"
              required
              min="0"
              value={form.discountValue}
              onChange={(e) => setField('discountValue', e.target.value)}
              onBlur={() => markTouched('discountValue')}
            />
            {touched.discountValue && fieldErrors.discountValue && (
              <p className="field-error">{fieldErrors.discountValue}</p>
            )}
          </div>
          <div className={`field ${touched.usageLimit && fieldErrors.usageLimit ? 'invalid' : ''}`}>
            <label>Usage Limit</label>
            <input
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setField('usageLimit', e.target.value)}
              onBlur={() => markTouched('usageLimit')}
            />
            {touched.usageLimit && fieldErrors.usageLimit && <p className="field-error">{fieldErrors.usageLimit}</p>}
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
            Active
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.oneUsePerCustomer}
              onChange={(e) => setField('oneUsePerCustomer', e.target.checked)}
            />
            One use per customer
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save Coupon'}
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(historyCode)} onClose={() => setHistoryCode(null)} title={`Usage History — ${historyCode}`}>
        {!redemptions && <Loader label="Loading usage history…" />}
        {redemptions && redemptions.length === 0 && <EmptyState title="Not used yet" />}
        {redemptions && redemptions.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Discount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.redemptionId}>
                    <td>
                      {r.customerName}
                      <p className="field-hint" style={{ margin: '2px 0 0' }}>{r.customerEmail}</p>
                    </td>
                    <td>−₹{r.discountAmount.toFixed(2)}</td>
                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatDate } from '../../utils/date';
import { Modal } from '../../components/Modal';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { couponCode as validateCouponCode, positiveNumber, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import { Pagination } from '../../components/Pagination';
import { ErrorState } from '../../components/ErrorState';
import { AdminSearchField, SortableTh, ResetFiltersButton, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import './Admin.css';

const EMPTY_FORM = {
  code: '',
  discountType: 'percentage',
  discountValue: '',
  isActive: true,
  usageLimit: '',
  oneUsePerCustomer: false,
  expiresAt: '',
};
const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { status: '', discountType: '' },
};

const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', expired: 'Expired', exhausted: 'Limit reached' };
const STATUS_PILL = { active: 'pill-active', inactive: 'pill-inactive', expired: 'pill-danger', exhausted: 'pill-warning' };

// The store operates in India: an expiry date means the END of that day, IST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function isoToIstDate(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '' : new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function istEndOfDayIso(date) {
  return new Date(`${date}T23:59:59.999+05:30`).toISOString();
}

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
  const list = useAdminList({
    fetcher: adminService.getCoupons,
    resultKey: 'coupons',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: coupons, filters, setFilter } = list;
  const load = list.reload;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [historyCode, setHistoryCode] = useState(null);
  const [redemptions, setRedemptions] = useState(null);


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
      expiresAt: isoToIstDate(coupon.expiresAt),
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
      // '' clears an existing expiry on edit (the API accepts it).
      ...(form.expiresAt ? { expiresAt: istEndOfDayIso(form.expiresAt) } : editingCode ? { expiresAt: '' } : {}),
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

  return (
    <div>
      <div className="admin-page-header">
        <h1>Coupons</h1>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Add Coupon
        </button>
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by coupon code…"
          label="Search coupons"
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={filters.discountType}
          onChange={(e) => setFilter('discountType', e.target.value)}
          aria-label="Discount type"
        >
          <option value="">All discount types</option>
          <option value="percentage">Percentage</option>
          <option value="flat">Flat amount</option>
        </select>
        <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
      </div>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && !coupons && <Loader label="Loading coupons…" />}

      {!list.error && coupons?.length === 0 ? (
        <EmptyState
          title={list.hasActiveFilters ? 'No coupons match these filters' : 'No coupons yet'}
          message={list.hasActiveFilters ? 'Try a different search or reset the filters.' : undefined}
        />
      ) : null}

      {!list.error && coupons?.length > 0 && (
        <>
        <ResultCount pagination={list.pagination} loading={list.loading} label="coupons" />
        <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
          <table className="admin-table admin-table-compact">
            <thead>
              <tr>
                <SortableTh label="Code" field="code" {...sortProps} />
                <th>Discount</th>
                <SortableTh label="Usage" field="usageCount" firstDir="desc" {...sortProps} />
                <th>Per Customer</th>
                <SortableTh label="Expires" field="expiresAt" {...sortProps} />
                <SortableTh label="Status" field="status" {...sortProps} />
                <SortableTh label="Created" field="createdAt" firstDir="desc" {...sortProps} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(c.code)}>
                      {c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </button>
                  </td>
                  <td>{c.oneUsePerCustomer ? 'One use' : 'Unlimited'}</td>
                  <td>{c.expiresAt ? formatDate(c.expiresAt) : 'No expiry'}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[c.effectiveStatus] || 'pill-inactive'}`}>
                      {STATUS_LABELS[c.effectiveStatus] || (c.isActive ? 'Active' : 'Inactive')}
                    </span>
                  </td>
                  <td>{formatDate(c.createdAt)}</td>
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
          {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="coupons" />}
        </div>
        </>
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
          <div className="field">
            <label htmlFor="coupon-expires">Expires on (optional)</label>
            <input
              id="coupon-expires"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setField('expiresAt', e.target.value)}
            />
            <p className="field-hint">Valid through the end of this day (IST). Leave empty for no expiry.</p>
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
                    <td>{formatDate(r.createdAt)}</td>
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

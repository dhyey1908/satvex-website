import { useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatDate } from '../../utils/date';
import { formatDay } from '../../utils/dateRange';
import { Modal } from '../../components/Modal';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { couponCode as validateCouponCode, positiveNumber, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { RowMenu } from '../../components/admin/RowMenu';
import { DateRangePicker } from '../../components/admin/DateRangePicker';
import { useAdminList } from '../../hooks/useAdminList';
import { todayIST } from '../../utils/dateRange';
import { Percent, Ticket } from 'lucide-react';
import './Admin.css';
import './AdminLists.css';

const EMPTY_FORM = {
  code: '',
  discountType: 'percentage',
  discountValue: '',
  isActive: true,
  usageLimit: '',
  minOrderValue: '',
  oneUsePerCustomer: false,
  expiresAt: '',
};

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { status: '', discountType: '' },
};

const STATUS_LABELS = { active: 'Active', inactive: 'Inactive', expired: 'Expired', exhausted: 'Limit reached' };
const STATUS_TONE = { active: 'green', inactive: 'grey', expired: 'red', exhausted: 'amber' };

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
    pageSize: 25,
    urlSync: true,
  });
  const { items: coupons, filters, setFilter } = list;
  const total = list.pagination?.total ?? 0;
  const load = list.reload;
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
      minOrderValue: coupon.minOrderValue || '',
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
      // 0 clears an existing minimum on edit.
      minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : 0,
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

  const day = (iso) => {
    const d = isoToIstDate(iso);
    return d ? formatDay(d) : '—';
  };

  const columns = [
    { key: 'code', header: 'Code', sortField: 'code', className: 'ui-cell-primary', render: (c) => <span className="ui-cell-main">{c.code}</span> },
    { key: 'discount', header: 'Discount', render: (c) => (c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`) },
    {
      key: 'usage',
      header: 'Usage',
      sortField: 'usageCount',
      firstDir: 'desc',
      render: (c) => (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory(c.code)}>
          {c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}
        </button>
      ),
    },
    {
      key: 'perCustomer',
      header: 'Per customer',
      render: (c) => (
        <>
          {c.oneUsePerCustomer ? 'One use' : 'Unlimited'}
          {c.minOrderValue > 0 && <span className="ui-cell-sub">Min order ₹{c.minOrderValue}</span>}
        </>
      ),
    },
    { key: 'expires', header: 'Expires', sortField: 'expiresAt', render: (c) => (c.expiresAt ? day(c.expiresAt) : <span className="ui-muted">No expiry</span>) },
    { key: 'status', header: 'Status', sortField: 'status', render: (c) => <StatusBadge tone={STATUS_TONE[c.effectiveStatus] || (c.isActive ? 'green' : 'grey')} label={STATUS_LABELS[c.effectiveStatus] || (c.isActive ? 'Active' : 'Inactive')} /> },
    { key: 'created', header: 'Created', sortField: 'createdAt', firstDir: 'desc', render: (c) => day(c.createdAt) },
    {
      key: 'menu',
      header: '',
      className: 'ui-cell-actions',
      render: (c) => (
        <RowMenu
          items={[
            { label: 'Edit', icon: Pencil, onClick: () => openEdit(c) },
            { label: 'Usage history', icon: Users, onClick: () => openHistory(c.code) },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(c.code) },
          ]}
        />
      ),
    },
  ];

  const chips = [
    { key: 'status', label: 'Status', icon: Ticket, options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label, tone: STATUS_TONE[value] })) },
    { key: 'discountType', label: 'Type', icon: Percent, options: [{ value: 'percentage', label: 'Percentage' }, { value: 'flat', label: 'Flat amount' }] },
  ];

  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle={coupons ? countLabel(total, 'coupon') : ' '}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
            <Plus size={16} /> Add coupon
          </button>
        }
      />
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search coupon code…' }}
        chips={chips}
        values={filters}
        onChange={setFilter}
        onClearAll={list.clearFilters}
        resultText={coupons ? `Showing ${coupons.length} of ${total} coupons` : null}
        searchLabel="Search coupons"
      />
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={coupons}
            rowKey={(c) => c.code}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            onRowClick={openEdit}
            caption="Coupons"
            empty={
              <TableEmpty
                icon={Ticket}
                title={list.hasActiveFilters ? 'No coupons match these filters' : 'No coupons yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Create a coupon to offer a discount.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="coupons" />
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
            <label htmlFor="coupon-min">Minimum order value (₹, optional)</label>
            <input
              id="coupon-min"
              type="number"
              min="0"
              value={form.minOrderValue}
              onChange={(e) => setField('minOrderValue', e.target.value)}
            />
            <p className="field-hint">The coupon only works when the cart is at least this much. A flat discount must be smaller than it.</p>
          </div>
          <div className="field">
            <label htmlFor="coupon-expires">Expires on (optional)</label>
            <DateRangePicker
              mode="single"
              label="Expires on"
              emptyText="No expiry"
              from={form.expiresAt}
              to={form.expiresAt}
              min={todayIST()}
              onChange={({ from }) => setField('expiresAt', from)}
              fullWidth
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

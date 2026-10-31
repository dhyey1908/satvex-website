import { useState } from 'react';
import { Phone, Copy, MapPin, Clock, AlertTriangle, CheckCircle2, Pencil, XCircle, RotateCw, History } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../Modal';
import { StatusBadge } from './StatusBadge';
import { rupees } from '../../utils/csv';
import { formatShortDateTime } from '../../utils/dateRange';
import { mapServerFieldErrors } from '../../utils/formErrors';
import { combinedAddress, addressTextProblem, MAX_ADDRESS, COUNTER_FROM, isEnglishAddressText, ENGLISH_MESSAGE } from '../../utils/addressRules';
import './OrderActionCard.css';

const CANCEL_REASONS = ['No answer', 'Customer cancelled', 'Fake order', 'Other'];
export const COUNTS_CHANGED = 'satvex-admin-counts-changed';
const HOUR = 60 * 60 * 1000;

/** How long a COD order has been waiting for its confirmation call: amber from 24h, red from 48h. */
export function waitingTone(order, now = Date.now()) {
  if (order.status !== 'Awaiting confirmation') return null;
  const hours = (now - new Date(order.createdAt).getTime()) / HOUR;
  if (hours >= 48) return { tone: 'red', label: 'Waiting for 48h+' };
  if (hours >= 24) return { tone: 'amber', label: 'Waiting for 24h+' };
  return null;
}

export const fullAddress = (a = {}) => [combinedAddress(a.line1, a.landmark), a.city, [a.state, a.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ');

const ADDRESS_FIELD_MAP = {
  'address.line1': 'line1',
  'address.landmark': 'landmark',
  'address.city': 'city',
  'address.state': 'state',
  'address.pincode': 'pincode',
};

/**
 * One order that needs a person: a COD order waiting for its confirmation call, or one whose shipment could not be
 * booked. Everything needed to make the call is on the card (name, phone with Call + Copy, the full address with the
 * landmark, items, total, COD fee), plus the actions: Confirm & ship / Retry Shiprocket, Edit address, Cancel.
 */
export function OrderActionCard({ order, onChanged: reloadList }) {
  const { showToast } = useToast();
  // Reload the list, and tell the sidebar to refresh its badge (it otherwise only polls every couple of minutes).
  const onChanged = () => {
    reloadList();
    window.dispatchEvent(new Event(COUNTS_CHANGED));
  };
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const waiting = waitingTone(order);
  const error = order.shipmentError;
  const phone = order.customer?.phone || '';
  const history = order.addressHistory || [];
  const itemsText = (order.items || []).map((i) => `${i.sellingOptionName || i.productName}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`);

  async function run(kind, fn) {
    setBusy(kind);
    try {
      const result = await fn();
      if (result.outcome === 'confirmed') showToast('Confirmed and sent to Shiprocket', 'success');
      else if (result.outcome === 'address_needs_fix') showToast(result.error?.plain || 'Shiprocket would not accept this order. Fix the address and try again.', 'error');
      else if (result.outcome === 'retry_needed') showToast('Shiprocket could not be reached. It will be retried automatically.', 'error');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const copyPhone = () => navigator.clipboard?.writeText(phone).then(() => showToast('Phone number copied', 'success'));

  return (
    <article className={`oac ${order.status === 'Address needs fix' ? 'is-fix' : ''}`} aria-label={`Order ${order.orderId.slice(0, 8)}`}>
      <header className="oac-head">
        <strong>#{order.orderId.slice(0, 8)}</strong>
        <StatusBadge kind="order" value={order.status} />
        <StatusBadge tone="outline" label={order.paymentMethod === 'Online' ? 'Prepaid' : 'COD'} />
        {waiting && <StatusBadge tone={waiting.tone} label={waiting.label} />}
        {order.deliveryNotVerified && <StatusBadge tone="amber" label="Delivery not verified" title="Shiprocket could not be asked whether this pincode is serviceable when the order was placed." />}
        <span className="oac-time">
          <Clock size={13} aria-hidden="true" /> {formatShortDateTime(order.createdAt)}
        </span>
      </header>

      <div className="oac-body">
        <section className="oac-block">
          <h4>{order.customer?.name || '—'}</h4>
          <p className="oac-phone">
            <span>{phone || '—'}</span>
            {phone && (
              <>
                <a className="btn btn-outline btn-sm" href={`tel:${phone}`}>
                  <Phone size={14} /> Call
                </a>
                <button type="button" className="btn btn-outline btn-sm" onClick={copyPhone}>
                  <Copy size={14} /> Copy
                </button>
              </>
            )}
          </p>
          <p className="oac-address">
            <MapPin size={14} aria-hidden="true" /> <span>{fullAddress(order.address)}</span>
          </p>
        </section>

        <section className="oac-block">
          <p className="oac-items">{itemsText.join(' · ') || '—'}</p>
          <p className="oac-total">
            <strong>{rupees(order.total)}</strong>
            {order.codCharge > 0 && <span> · incl. COD fee {rupees(order.codCharge)}</span>}
          </p>
        </section>
      </div>

      {error && (
        <div className={`oac-error ${error.kind === 'rejected' ? 'is-rejected' : ''}`} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p>{error.plain}</p>
            <p className="oac-error-exact">
              Shiprocket said{error.status ? ` (${error.status})` : ''}: <q>{error.message}</q>
              {error.errors && <code>{JSON.stringify(error.errors)}</code>}
            </p>
          </div>
        </div>
      )}

      <footer className="oac-actions">
        {order.status === 'Awaiting confirmation' && (
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run('confirm', () => adminService.confirmOrder(order.orderId))}>
            <CheckCircle2 size={14} /> {busy === 'confirm' ? 'Sending…' : 'Confirm & ship'}
          </button>
        )}
        {(order.status === 'Address needs fix' || order.status === 'Shipping retry needed') && (
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => run('retry', () => adminService.retryShiprocket(order.orderId))}>
            <RotateCw size={14} /> {busy === 'retry' ? 'Retrying…' : 'Retry Shiprocket'}
          </button>
        )}
        <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(busy)} onClick={() => setEditing(true)}>
          <Pencil size={14} /> Edit address
        </button>
        <button type="button" className="btn btn-outline btn-sm oac-cancel" disabled={Boolean(busy)} onClick={() => setCancelling(true)}>
          <XCircle size={14} /> Cancel
        </button>
      </footer>

      {history.length > 0 && (
        <details className="oac-history">
          <summary>
            <History size={14} aria-hidden="true" /> Address changes ({history.length})
          </summary>
          <ol>
            {history.map((h, i) => (
              <li key={i}>
                <p className="oac-history-meta">
                  {formatShortDateTime(h.at)} · {h.by || 'admin'}
                </p>
                <p>
                  <s>{fullAddress(h.from)}</s>
                </p>
                <p>{fullAddress(h.to)}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      <EditAddressModal open={editing} order={order} onClose={() => setEditing(false)} onSaved={onChanged} />
      <CancelModal open={cancelling} order={order} onClose={() => setCancelling(false)} onCancelled={onChanged} />
    </article>
  );
}

function CancelModal({ open, order, onClose, onCancelled }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason) return;
    setSaving(true);
    try {
      await adminService.updateOrderStatus(order.orderId, 'Cancelled', { cancelReason: reason, cancelNote: note.trim() || undefined });
      showToast('Order cancelled', 'success');
      onClose();
      onCancelled();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={`Cancel order #${order.orderId.slice(0, 8)}?`}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={saving}>
            Keep order
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!reason || saving}>
            {saving ? 'Cancelling…' : 'Cancel order'}
          </button>
        </>
      }
    >
      <fieldset className="oac-reasons">
        <legend>Why is it being cancelled?</legend>
        {CANCEL_REASONS.map((r) => (
          <label key={r} className="checkbox-field">
            <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
      </fieldset>
      {reason === 'Other' && (
        <div className="field">
          <label htmlFor="cancel-note">Note (optional)</label>
          <input id="cancel-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}

function EditAddressModal({ open, order, onClose, onSaved }) {
  const { showToast } = useToast();
  const start = order.address || {};
  const [form, setForm] = useState({ line1: start.line1 || '', landmark: start.landmark || '', city: start.city || '', state: start.state || '', pincode: start.pincode || '' });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setBanner('');
    if (key === 'city') setSuggestion(null);
  };
  const length = combinedAddress(form.line1, form.landmark).length;

  // The same rules checkout applies - the server checks every one of them again.
  function check() {
    const found = {};
    if (!isEnglishAddressText(form.city)) found.city = ENGLISH_MESSAGE;
    const problem = addressTextProblem({ line1: form.line1, landmark: form.landmark });
    if (problem) found[problem.field] = problem.message;
    if (!/^\d{6}$/.test(form.pincode)) found.pincode = 'Enter a valid 6-digit pincode.';
    if (!form.city.trim()) found.city = 'City is required.';
    if (!form.state.trim()) found.state = 'State is required.';
    return found;
  }

  async function save() {
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await adminService.updateOrderAddress(order.orderId, { ...form, country: order.address?.country || 'India' });
      showToast('Address updated', 'success');
      onClose();
      onSaved();
    } catch (err) {
      const fields = mapServerFieldErrors(err, ADDRESS_FIELD_MAP);
      if (fields) setErrors(fields);
      else {
        setBanner(err.message);
        if (err.code === 'CITY_MISMATCH') setSuggestion(err.details?.suggestion || null);
        if (err.code === 'PINCODE_NOT_FOUND' || err.code === 'NO_COURIER') setErrors({ pincode: err.message });
        if (err.code === 'ADDRESS_STATE_MISMATCH') setErrors({ state: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, extra = {}) => (
    <div className={`field ${errors[key] ? 'invalid' : ''}`}>
      <label htmlFor={`oac-${order.orderId}-${key}`}>{label}</label>
      <input id={`oac-${order.orderId}-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
      {errors[key] && <p className="field-error">{errors[key]}</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={`Edit address · #${order.orderId.slice(0, 8)}`}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save address'}
          </button>
        </>
      }
    >
      {banner && (
        <p className="field-error" role="alert">
          {banner}{' '}
          {suggestion && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { set('city', suggestion); }}>
              Use {suggestion}
            </button>
          )}
        </p>
      )}
      {field('line1', 'House / flat / street')}
      {field('landmark', 'Landmark', { placeholder: 'e.g. Near City Mall / Opp. SBI Bank' })}
      {length > COUNTER_FROM && <p className={`field-hint address-counter ${length > MAX_ADDRESS ? 'is-over' : ''}`}>{length} / {MAX_ADDRESS}</p>}
      <div className="field-row">
        {field('city', 'City')}
        {field('state', 'State')}
      </div>
      {field('pincode', 'Pincode', { inputMode: 'numeric', maxLength: 6 })}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { adminService } from '../services/adminService';
import { useToast } from '../context/ToastContext';

/**
 * "Shipped manually": the admin booked this order's shipment by hand in the
 * Shiprocket panel after the automatic booking failed. Entering Shiprocket's
 * order id here links it to this order, so tracking updates reach it, the retry
 * stops, and it leaves the Sync Issues list. Nothing is created at Shiprocket.
 *
 * `replacing` (the order, when it already has a shipment): the Shiprocket order was cancelled and a new one made by
 * hand, so the new id takes the old one's place and the old AWB / tracking link / label / invoice are dropped.
 */
export function LinkShipmentModal({ open, onClose, orderId, onLinked, initial = null, replacing = null }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ shiprocketOrderId: '', awbCode: '', courierName: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const editing = Boolean(initial);

  // Opening to EDIT pre-fills what was entered before; opening to link starts empty.
  useEffect(() => {
    if (open) {
      setForm({ shiprocketOrderId: initial?.shiprocketOrderId || '', awbCode: initial?.awbCode || '', courierName: initial?.courierName || '', note: initial?.manualShipmentNote || '' });
      setError(null);
    }
  }, [open, initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    if (!/^\d{4,15}$/.test(form.shiprocketOrderId.trim())) {
      setError('Enter the Shiprocket order id — digits only.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminService.linkShipment(orderId, replacing ? { ...form, replace: true } : form);
      showToast(
        replacing ? 'Shipment replaced. This order now follows the new Shiprocket shipment.' : editing ? 'Shipment details updated.' : 'Linked. This order now follows the Shiprocket shipment.',
        'success'
      );
      onLinked?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={replacing ? 'Replace Shiprocket shipment' : editing ? 'Edit manual shipment' : 'Shipped manually in Shiprocket'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={16} className="btn-spinner" /> : replacing ? 'Replace shipment' : editing ? 'Save changes' : 'Link shipment'}
          </button>
        </>
      }
    >
      {replacing ? (
        <p className="field-hint">
          This order now follows Shiprocket order <strong>{replacing.shiprocketOrderId}</strong>
          {replacing.awbCode ? <> (AWB {replacing.awbCode})</> : null}. Cancelled it and made a new one in the Shiprocket panel?
          Enter the NEW order&rsquo;s details. The old AWB, tracking link, label and invoice come off this order, and the customer
          sees the new tracking instead. Nothing is created or cancelled at Shiprocket.
        </p>
      ) : (
        <p className="field-hint">
          Created this shipment yourself in the Shiprocket panel? Enter its details so the order stops showing
          &ldquo;Sync Failed&rdquo; and its tracking updates arrive here. We will not book anything again.
        </p>
      )}
      <div className="field">
        <label htmlFor="ls-order-id">{replacing ? 'New Shiprocket order id *' : 'Shiprocket order id *'}</label>
        <input id="ls-order-id" inputMode="numeric" value={form.shiprocketOrderId} onChange={set('shiprocketOrderId')} placeholder="e.g. 987654321" />
      </div>
      <div className="field">
        <label htmlFor="ls-awb">{replacing ? 'New AWB / tracking number (recommended: it gives the customer their tracking link)' : 'AWB / tracking number (optional)'}</label>
        <input id="ls-awb" value={form.awbCode} onChange={set('awbCode')} />
      </div>
      <div className="field">
        <label htmlFor="ls-courier">Courier (optional)</label>
        <input id="ls-courier" value={form.courierName} onChange={set('courierName')} />
      </div>
      <div className="field">
        <label htmlFor="ls-note">Note (optional)</label>
        <input id="ls-note" value={form.note} onChange={set('note')} maxLength={300} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}

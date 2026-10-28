import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { ComboColorSelector } from './ComboColorSelector';

/**
 * Re-opens the colour picker for one cart line. The picker is the same control
 * as the product page; the backend re-validates the new selection (stock,
 * pack size, duplicates) when it is saved.
 */
export function EditColoursModal({ open, onClose, item, product, onSave }) {
  const option = product?.sellingOptions?.find((o) => o.id === item?.sellingOptionId);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setSelected(item.selectedColors || []);
      setMessage(null);
    }
  }, [open, item]);

  const required = option?.quantity ?? item?.selectedColors?.length ?? 0;
  const complete = selected.length === required;

  async function handleSave() {
    if (!complete) {
      setMessage(`Please select ${required} colour${required === 1 ? '' : 's'}.`);
      return;
    }
    setSaving(true);
    try {
      await onSave(selected);
      onClose();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit colours"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !complete}>
            {saving ? <Loader2 size={16} className="btn-spinner" /> : 'Save colours'}
          </button>
        </>
      }
    >
      {product && option ? (
        <>
          <p className="field-hint">
            {item.sellingOptionName}: choose {required} colour{required === 1 ? '' : 's'} — {selected.length} / {required} selected
          </p>
          <ComboColorSelector
            variants={product.variants}
            requiredCount={required}
            allowDuplicateColors={option.allowDuplicateColors}
            selectedIds={selected}
            onChange={(next) => { setSelected(next); setMessage(null); }}
            onBlocked={setMessage}
          />
          {message && <p className="pdp-color-error" role="alert">{message}</p>}
        </>
      ) : (
        <p>Loading colours…</p>
      )}
    </Modal>
  );
}

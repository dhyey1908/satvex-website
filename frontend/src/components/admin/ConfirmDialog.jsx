import { Modal } from '../Modal';

/** "Remove X?" confirmation. Name the thing being removed in `message`. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Remove', busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

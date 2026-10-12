import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { formatDateTime } from '../../utils/date';
import './Admin.css';

const BUCKET_LABELS = {
  retrying: 'Retrying',
  failed: 'Failed — Needs Action',
  no_job: 'Not Synced',
};
const BUCKET_PILL_CLASS = {
  retrying: 'pill-warning',
  failed: 'pill-danger',
  no_job: 'pill-danger',
};

export function AdminShipmentIssues() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);

  function load() {
    setError(null);
    adminService
      .shipmentSyncIssues()
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetryOne(orderId) {
    setRetryingId(orderId);
    try {
      await adminService.retryShipment(orderId);
      showToast('Shipment retry succeeded', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
      load(); // attempt count/last error changed even on failure
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRetryAll() {
    const ok = await confirm({
      title: 'Retry all failed shipments?',
      message: `This retries ${data.counts.total} order(s) one at a time against Shiprocket. It can take a while for a large list.`,
      confirmLabel: 'Retry All',
    });
    if (!ok) return;
    setRetryingAll(true);
    try {
      const result = await adminService.retryAllShipments();
      showToast(`Retried ${result.total}: ${result.succeeded} succeeded, ${result.failed} still failing`, result.failed > 0 ? 'warning' : 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetryingAll(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loader label="Loading shipment sync issues…" />;

  const { issues, counts } = data;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Shipment Sync Issues</h1>
        {issues.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleRetryAll} disabled={retryingAll}>
            <RefreshCw size={14} /> {retryingAll ? 'Retrying…' : 'Retry All Failed'}
          </button>
        )}
      </div>

      {issues.length > 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
          {counts.total} order(s) paid/confirmed but not yet shipped to Shiprocket — {counts.retrying} still retrying
          automatically, {counts.failed} exhausted retries and need action, {counts.noJob} never got a sync job queued
          (e.g. Shiprocket was disabled when the order was paid).
        </p>
      )}

      {issues.length === 0 && <EmptyState title="No shipment sync issues" message="Every paid order has synced to Shiprocket." />}

      {issues.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.orderId}>
                  <td>
                    <Link to={`/admin/orders/${i.orderId}`}>{i.orderId.slice(0, 8)}</Link>
                  </td>
                  <td>{i.customerName || '—'}</td>
                  <td>₹{Number(i.total || 0).toFixed(2)}</td>
                  <td>{i.paidAt ? formatDateTime(i.paidAt) : '—'}</td>
                  <td>
                    <span className={`pill ${BUCKET_PILL_CLASS[i.bucket]}`}>{BUCKET_LABELS[i.bucket]}</span>
                  </td>
                  <td>{i.attempts}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{i.lastError || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRetryOne(i.orderId)}
                      disabled={retryingId === i.orderId || retryingAll}
                    >
                      {retryingId === i.orderId ? 'Retrying…' : 'Retry Shipment'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

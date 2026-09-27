import './OrderStatusBadge.css';

export function OrderStatusBadge({ status }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>;
}

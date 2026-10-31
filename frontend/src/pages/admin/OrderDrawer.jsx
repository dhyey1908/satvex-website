import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, FileText, Tag } from 'lucide-react';
import { Drawer } from '../../components/Drawer';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { effectivePaymentStatus } from '../../utils/paymentStatus';
import { PAYMENT_LABELS, SHIPMENT_LABELS } from '../../utils/statusTones';
import { formatShortDateTime } from '../../utils/dateRange';
import { rupees } from '../../utils/csv';
import { itemImage } from '../../utils/itemImage';
import { whatsappLink } from '../../utils/whatsapp';
import { SmartImage } from '../../components/SmartImage';

const colours = (item) => (item.selectedColorDetails || []).map((c) => c.colorName).filter(Boolean).join(', ');

function Row({ label, value, strong }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={`od-row ${strong ? 'is-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Quick look at an order from the list. Refunds, shipment actions and status changes stay on the full page. */
export function OrderDrawer({ order, onClose }) {
  if (!order) return null;
  const paymentKey = effectivePaymentStatus(order) || order.paymentStatus;
  const wa = whatsappLink(order.customer?.phone, `Hi ${order.customer?.name || ''}, this is SATVEX about your order ${order.orderId.slice(0, 8)}.`);
  const events = [...(order.trackingEvents || [])].reverse();

  return (
    <Drawer open onClose={onClose} title={`Order ${order.orderId.slice(0, 8)}`}>
      <div className="od">
        <div className="od-badges">
          <StatusBadge kind="order" value={order.status} />
          <StatusBadge
            kind="payment"
            value={order.paymentMethod === 'Online' ? paymentKey : 'not_required'}
            label={order.paymentMethod === 'Online' ? PAYMENT_LABELS[paymentKey] || paymentKey : 'COD'}
          />
          <StatusBadge kind="shipment" value={order.shipmentStatus || 'not_created'} label={SHIPMENT_LABELS[order.shipmentStatus || 'not_created']} />
        </div>
        <p className="ui-muted od-time">Placed {formatShortDateTime(order.createdAt)} IST</p>

        {order.conflicts?.length > 0 && (
          <div className="od-warning" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <ul>{order.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}

        <section>
          <h4>Items</h4>
          {(order.items || []).map((item, i) => {
            const img = itemImage(item);
            return (
              <div className="od-item" key={`${item.productId}-${i}`}>
                {img ? <SmartImage src={img} alt="" /> : <span className="od-item-blank" />}
                <div>
                  <div className="ui-cell-main">{item.productName}</div>
                  <span className="ui-cell-sub">
                    {item.sellingOptionName} × {item.quantity}
                    {colours(item) ? ` · ${colours(item)}` : ''}
                  </span>
                </div>
                <span>{rupees(item.subtotal)}</span>
              </div>
            );
          })}
        </section>

        <section>
          <h4>Price</h4>
          <Row label="Items" value={rupees(order.subtotal)} />
          {order.discountAmount > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`− ${rupees(order.discountAmount)}`} />}
          {order.prepaidDiscount > 0 && <Row label="Prepaid discount" value={`− ${rupees(order.prepaidDiscount)}`} />}
          <Row label="Shipping" value={order.shipping > 0 ? rupees(order.shipping) : 'Free'} />
          {order.codCharge > 0 && <Row label="COD charge" value={rupees(order.codCharge)} />}
          {order.gstAmount > 0 && <Row label={`GST${order.gstPercent ? ` (${order.gstPercent}%)` : ''}`} value={rupees(order.gstAmount)} />}
          <Row label="Total" value={rupees(order.total)} strong />
        </section>

        <section>
          <h4>Customer</h4>
          <Row label="Name" value={order.customer?.name} />
          <Row label="Phone" value={order.customer?.phone} />
          <Row label="Email" value={order.customer?.email} />
          <p className="od-address">
            {[order.address?.line1, order.address?.line2].filter(Boolean).join(', ')}
            <br />
            {[order.address?.city, order.address?.state, order.address?.pincode].filter(Boolean).join(', ')}
          </p>
          {wa && (
            <a className="btn btn-outline btn-sm" href={wa} target="_blank" rel="noreferrer">
              Message on WhatsApp
            </a>
          )}
        </section>

        <section>
          <h4>Shipping</h4>
          <Row label="Courier" value={order.courierName} />
          <Row label="AWB" value={order.awbCode} />
          <Row label="Tracking" value={order.lastTrackingStatus} />
          <div className="od-links">
            {order.awbCode && (
              <a href={`https://shiprocket.co/tracking/${encodeURIComponent(order.awbCode)}`} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Track shipment
              </a>
            )}
            {order.labelUrl && (
              <a href={order.labelUrl} target="_blank" rel="noreferrer">
                <Tag size={14} /> Label
              </a>
            )}
            {order.invoiceUrl && (
              <a href={order.invoiceUrl} target="_blank" rel="noreferrer">
                <FileText size={14} /> Invoice
              </a>
            )}
          </div>
          {events.length > 0 && (
            <ol className="od-timeline">
              {events.map((e, i) => (
                <li key={`${e.timestamp}-${i}`}>
                  <strong>{e.status}</strong>
                  <span className="ui-muted">{formatShortDateTime(e.timestamp)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Link to={`/admin/orders/${order.orderId}`} className="btn btn-primary btn-sm od-open">
          Open full order · refund, shipment, status
        </Link>
      </div>
    </Drawer>
  );
}

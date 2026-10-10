import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { orderService } from '../services/orderService';
import { OrderSummary } from '../components/OrderSummary';
import { Loader } from '../components/Loader';
import { ErrorState } from '../components/ErrorState';
import { useToast } from '../context/ToastContext';
import { redirectToCashfreeCheckout } from '../utils/cashfree';
import { openGoKwikCheckout } from '../utils/gokwik';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './OrderConfirmation.css';

// Poll for up to ~60s (20 tries, 3s apart) before giving up and asking the
// customer to wait rather than immediately offering a retry — a slow
// webhook is far more likely than an actual failure, and an early retry
// button risks a double payment.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

export function OrderConfirmation() {
  useDocumentMeta({ title: 'Order Confirmed' });

  const { id } = useParams();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const pollCount = useRef(0);
  const gokwikCodNotified = useRef(false);

  useEffect(() => {
    orderService
      .getById(id)
      .then(({ order: o }) => setOrder(o))
      .catch((err) => setError(err.message));
  }, [id]);

  // SANDBOX ONLY, best-effort — per gokwik_integration_notes.md, COD orders
  // call initPayment here on the thank-you page rather than at checkout
  // time. Fire-once (ref guard against StrictMode's double-invoke), never
  // blocks rendering, and never changes what the customer sees either way —
  // the order is already placed and confirmed regardless of this call's
  // outcome. TODO(confirm): the notes don't say what GoKwik does with this
  // call for COD or what, if anything, we should do with its result.
  useEffect(() => {
    if (!order || gokwikCodNotified.current) return;
    if (order.paymentProvider !== 'gokwik' || order.paymentMethod !== 'COD') return;
    gokwikCodNotified.current = true;
    // Mock mode: there is no real GoKwik order for the widget to show (our
    // server never called GoKwik at all) — skip opening it entirely rather
    // than showing a broken popup on top of an already-confirmed order.
    if (order.gokwikMode === 'mock') return;
    openGoKwikCheckout({
      mid: order.gokwikMid,
      moid: order.orderId,
      orderType: 'cod',
      requestId: order.gokwikRequestId,
      gokwikOid: order.gokwikOid,
      environment: order.gokwikEnvironment,
    }).catch(() => {});
  }, [order]);

  const awaitingPayment = order?.paymentMethod === 'Online' && order?.paymentStatus === 'awaiting_payment';

  useEffect(() => {
    if (!awaitingPayment) return;
    if (pollCount.current >= MAX_POLLS) {
      setPollTimedOut(true);
      return;
    }

    const timer = setTimeout(() => {
      pollCount.current += 1;
      orderService
        .paymentStatus(id)
        .then(({ paymentStatus }) => {
          if (paymentStatus !== 'awaiting_payment') {
            orderService.getById(id).then(({ order: o }) => setOrder(o));
          } else {
            setPollTick((t) => t + 1); // advances the effect dependency to schedule the next poll
          }
        })
        .catch(() => setPollTick((t) => t + 1));
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [awaitingPayment, pollTick, id]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const { paymentSessionId, alreadyPaid } = await orderService.retryPayment(id);
      if (alreadyPaid) {
        const { order: o } = await orderService.getById(id);
        setOrder(o);
        showToast('Good news — this order is already paid.', 'success');
        return;
      }
      await redirectToCashfreeCheckout(paymentSessionId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetrying(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!order) return <Loader label="Loading order…" />;

  const paymentFailed = order.paymentMethod === 'Online' && order.paymentStatus === 'expired';

  if (awaitingPayment && !pollTimedOut) {
    return (
      <div className="container section order-confirmation">
        <Loader2 size={40} className="btn-spinner order-confirmation-verifying-icon" />
        <h1>Verifying your payment…</h1>
        <p className="order-confirmation-thanks">This only takes a few seconds — please don&apos;t close this page.</p>
      </div>
    );
  }

  if (awaitingPayment && pollTimedOut) {
    return (
      <div className="container section order-confirmation">
        <h1>Still confirming your payment</h1>
        <p className="order-confirmation-thanks">
          We&apos;re still waiting for your bank/UPI app to confirm this payment.{' '}
          <strong>Please don&apos;t pay again</strong> — we&apos;ll update this order automatically once it&apos;s
          confirmed. You can check back here or in{' '}
          <Link to="/account/orders">My Orders</Link>.
        </p>
      </div>
    );
  }

  if (paymentFailed) {
    return (
      <div className="container section order-confirmation">
        <h1>Payment didn&apos;t go through</h1>
        <p className="order-confirmation-thanks">
          This order&apos;s payment window has closed without a successful payment. You can try again below, or
          place a new order.
        </p>
        <div className="order-confirmation-actions">
          <button type="button" className="btn btn-primary" onClick={handleRetry} disabled={retrying}>
            {retrying ? <Loader2 size={16} className="btn-spinner" /> : 'Retry Payment'}
          </button>
          <Link to="/shop" className="btn btn-outline">
            Shop Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section order-confirmation">
      <div className="order-confirmation-badge">✓</div>
      <h1>Order Confirmed</h1>
      <p className="order-confirmation-thanks">
        Thank you, {order.customer.name.split(' ')[0]}! Your order has been placed successfully.
      </p>
      <p className="order-confirmation-number">
        Order Number: <strong>SATVEX-{order.orderId.slice(0, 8).toUpperCase()}</strong>
      </p>

      <div className="order-confirmation-grid">
        <OrderSummary
          subtotal={order.subtotal}
          discountAmount={order.discountAmount}
          couponCode={order.couponCode}
          gstPercent={order.gstPercent}
          gstAmount={order.gstAmount}
          shipping={order.shipping}
          codCharge={order.codCharge}
          total={order.total}
          itemsSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="checkout-summary-item">
                  <span>
                    {item.productName} · {item.sellingOptionName} × {item.quantity}
                  </span>
                  <span>₹{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
          }
        />

        <div className="card order-confirmation-address">
          <h3>Shipping To</h3>
          <p style={{ margin: 0 }}>{order.customer.name}</p>
          <p style={{ margin: 0 }}>{order.address.line1}</p>
          <p style={{ margin: 0 }}>
            {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
          <p style={{ margin: 0 }}>{order.address.country}</p>
          <p className="order-confirmation-processing">
            Your order is <strong>{order.status}</strong> and will be processed within 1-2 business days.
          </p>
        </div>
      </div>

      <div className="order-confirmation-actions">
        <Link to="/account/orders" className="btn btn-outline">
          View My Orders
        </Link>
        <Link to="/shop" className="btn btn-primary">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

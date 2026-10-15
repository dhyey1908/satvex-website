import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { orderService } from '../services/orderService';
import { OrderSummary } from '../components/OrderSummary';
import { OrderCelebration } from '../components/OrderCelebration';
import { CopyButton } from '../components/CopyButton';
import { Loader } from '../components/Loader';
import { ErrorState } from '../components/ErrorState';
import { useToast } from '../context/ToastContext';
import { redirectToPayuCheckout } from '../utils/payu';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './OrderConfirmation.css';

// Poll for up to ~2 minutes (40 tries, 3s apart) before giving up and
// asking the customer to wait rather than immediately offering a retry — a
// slow webhook is far more likely than an actual failure, and an early
// retry button risks a double payment. This is the ceiling for a genuinely
// unresolved PENDING payment; a definitive FAILED/USER_DROPPED result
// (surfaced via lastPaymentAttemptStatus) short-circuits this immediately
// instead of waiting out the full window.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;

export function OrderConfirmation() {
  useDocumentMeta({ title: 'Order Confirmed', noindex: true });

  const { id } = useParams();
  const { showToast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [lastAttemptStatus, setLastAttemptStatus] = useState(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const pollCount = useRef(0);
  const consecutivePollFailures = useRef(0);
  const celebratedRef = useRef(false);

  useEffect(() => {
    orderService
      .getById(id)
      .then(({ order: o }) => {
        setOrder(o);
        setLastAttemptStatus(o.lastPaymentAttemptStatus || null);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const awaitingPayment = order?.paymentMethod === 'Online' && order?.paymentStatus === 'awaiting_payment';
  // A FAILED or USER_DROPPED attempt is a definitive, final result for that
  // attempt — no reason to keep polling/waiting once we know it. PENDING
  // (and no attempt yet) are the only reasons to keep polling.
  const paymentDefinitivelyFailed = lastAttemptStatus === 'FAILED';
  const paymentDropped = lastAttemptStatus === 'USER_DROPPED';
  const stillPolling = awaitingPayment && !paymentDefinitivelyFailed && !paymentDropped && !pollTimedOut && !pollError;
  const paymentWindowExpired = order?.paymentMethod === 'Online' && order?.paymentStatus === 'expired';
  // Mirrors the exact condition that reaches the success render branch
  // below — only a genuinely confirmed order (COD immediately, or Online
  // once truly paid) ever fires the celebration, and only once per order
  // even as this component re-renders through every poll tick.
  const isConfirmedSuccess =
    Boolean(order) && !pollError && !awaitingPayment && !paymentDefinitivelyFailed && !paymentDropped && !paymentWindowExpired;

  useEffect(() => {
    if (isConfirmedSuccess && !celebratedRef.current) {
      celebratedRef.current = true;
      setCelebrationTrigger((n) => n + 1);
    }
  }, [isConfirmedSuccess]);

  useEffect(() => {
    if (!stillPolling) return;
    if (pollCount.current >= MAX_POLLS) {
      setPollTimedOut(true);
      return;
    }

    const timer = setTimeout(() => {
      pollCount.current += 1;
      orderService
        .paymentStatus(id)
        .then(({ paymentStatus, lastPaymentAttemptStatus }) => {
          consecutivePollFailures.current = 0;
          setLastAttemptStatus(lastPaymentAttemptStatus || null);
          if (paymentStatus !== 'awaiting_payment' || lastPaymentAttemptStatus === 'FAILED' || lastPaymentAttemptStatus === 'USER_DROPPED') {
            orderService.getById(id).then(({ order: o }) => setOrder(o));
          } else {
            setPollTick((t) => t + 1); // advances the effect dependency to schedule the next poll
          }
        })
        .catch(() => {
          consecutivePollFailures.current += 1;
          // 5 consecutive failed status checks (~15s of pure network
          // trouble, not just one blip) — stop silently retrying forever
          // and show a real error state with a manual way forward instead.
          if (consecutivePollFailures.current >= 5) {
            setPollError(true);
          } else {
            setPollTick((t) => t + 1);
          }
        });
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [stillPolling, pollTick, id]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const { payuParams, alreadyPaid } = await orderService.retryPayment(id);
      if (alreadyPaid) {
        const { order: o } = await orderService.getById(id);
        setOrder(o);
        showToast('Good news — this order is already paid.', 'success');
        return;
      }
      await redirectToPayuCheckout(payuParams);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetrying(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!order) return <Loader label="Loading order…" />;

  if (pollError) {
    return (
      <div className="container section order-confirmation">
        <h1>Couldn&apos;t check your payment status</h1>
        <p className="order-confirmation-thanks">
          We&apos;re having trouble reaching our server right now. Your payment itself may still have gone through —
          please don&apos;t pay again. Check your connection and try again, or check{' '}
          <Link to="/account/orders">My Orders</Link> in a moment.
        </p>
        <div className="order-confirmation-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setPollError(false);
              consecutivePollFailures.current = 0;
              setPollTick((t) => t + 1);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (paymentDefinitivelyFailed) {
    return (
      <div className="container section order-confirmation">
        <h1>Payment failed</h1>
        <p className="order-confirmation-thanks">
          Nothing was charged and your order has not been placed. You can try again below.
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

  if (paymentDropped) {
    return (
      <div className="container section order-confirmation">
        <h1>Payment not completed</h1>
        <p className="order-confirmation-thanks">
          It looks like the payment was closed before finishing. Nothing was charged — you can pay again below.
        </p>
        <div className="order-confirmation-actions">
          <button type="button" className="btn btn-primary" onClick={handleRetry} disabled={retrying}>
            {retrying ? <Loader2 size={16} className="btn-spinner" /> : 'Pay Again'}
          </button>
          <Link to="/shop" className="btn btn-outline">
            Shop Again
          </Link>
        </div>
      </div>
    );
  }

  if (awaitingPayment && !pollTimedOut) {
    return (
      <div className="container section order-confirmation">
        <Loader2 size={40} className="btn-spinner order-confirmation-verifying-icon" />
        <h1>Payment is being confirmed</h1>
        <p className="order-confirmation-thanks">
          <strong>Please don&apos;t pay again.</strong> We&apos;ll update this page automatically as soon as it&apos;s
          confirmed.
        </p>
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
          confirmed. Check <Link to="/account/orders">My Orders</Link> in a little while.
        </p>
      </div>
    );
  }

  if (paymentWindowExpired) {
    return (
      <div className="container section order-confirmation">
        <h1>Payment window closed</h1>
        <p className="order-confirmation-thanks">
          This order&apos;s payment window closed without a successful payment. You can try again below, or place a
          new order.
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
      <OrderCelebration trigger={celebrationTrigger} />
      <motion.div
        className="order-confirmation-badge"
        initial={prefersReducedMotion ? false : { scale: 0.4, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
      >
        ✓
      </motion.div>
      <h1>Order Confirmed</h1>
      <p className="order-confirmation-thanks">
        Thank you, {order.customer.name.split(' ')[0]}! Your order has been placed successfully.
      </p>
      <p className="order-confirmation-number">
        Order Number: <strong>#{order.orderId.slice(0, 8)}</strong>
        <CopyButton value={order.orderId.slice(0, 8)} label="Copy order number" />
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
          prepaidDiscount={order.prepaidDiscount}
          total={order.total}
          itemsSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="checkout-summary-item order-confirmation-item">
                  <span className="order-confirmation-item-name">
                    {item.productName} · {item.sellingOptionName} × {item.quantity}
                  </span>
                  <span className="order-confirmation-item-price">₹{item.subtotal.toFixed(2)}</span>
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

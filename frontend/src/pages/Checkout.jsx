import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { orderService } from '../services/orderService';
import { addressService } from '../services/addressService';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { OrderSummary } from '../components/OrderSummary';
import { AddressCard } from '../components/AddressCard';
import { PageHeader } from '../components/PageHeader';
import { TruckIcon } from '../components/Icons';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Checkout.css';

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  line1: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

export function Checkout() {
  useDocumentMeta({ title: 'Checkout', path: '/checkout' });

  const { items, total, refresh, appliedCoupon, clearCoupon } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);

  useEffect(() => {
    addressService
      .list()
      .then(({ addresses: list }) => {
        setAddresses(list);
        const defaultAddr = list.find((a) => a.isDefault) || list[0];
        if (defaultAddr) applyAddress(defaultAddr);
        else setShowNewAddressForm(true);
      })
      .catch(() => {
        setAddresses([]);
        setShowNewAddressForm(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyAddress(addr) {
    setSelectedAddressId(addr.addressId);
    setShowNewAddressForm(false);
    setForm((prev) => ({
      ...prev,
      name: addr.fullName,
      phone: addr.phone,
      line1: addr.line1,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
    }));
  }

  function startNewAddress() {
    setSelectedAddressId(null);
    setShowNewAddressForm(true);
    setForm((prev) => ({ ...EMPTY_FORM, email: prev.email }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { order } = await orderService.checkout({
        customer: { name: form.name, phone: form.phone, email: form.email },
        address: {
          line1: form.line1,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          country: form.country,
        },
        couponCode: appliedCoupon?.code,
      });

      if (saveAddress && !selectedAddressId) {
        addressService
          .create({
            label: 'Home',
            fullName: form.name,
            phone: form.phone,
            line1: form.line1,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            country: form.country,
          })
          .catch(() => {});
      }

      clearCoupon();
      await refresh();
      showToast('Order placed!', 'success');
      navigate(`/order-confirmation/${order.orderId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Your cart is empty."
          message="Add something to your cart before checking out."
          action={
            <Link to="/shop" className="btn btn-primary">
              Shop Now
            </Link>
          }
        />
      </div>
    );
  }

  const discountAmount = appliedCoupon?.discountAmount || 0;
  const grandTotal = Number((total - discountAmount).toFixed(2));

  return (
    <div className="container section checkout-page">
      <Link to="/cart" className="checkout-return-link text-label-sm">← Return to Bag</Link>
      <PageHeader title="Secure Checkout" />

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          {addresses && addresses.length > 0 && (
            <div className="checkout-section card">
              <h3 className="checkout-section-title">Dispatch Destination</h3>
              <div className="checkout-address-grid">
                {addresses.map((addr) => (
                  <AddressCard
                    key={addr.addressId}
                    address={addr}
                    selected={selectedAddressId === addr.addressId}
                    onSelect={() => applyAddress(addr)}
                  />
                ))}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={startNewAddress} style={{ marginTop: 12 }}>
                + Add New Address
              </button>
            </div>
          )}

          {showNewAddressForm && (
            <div className="checkout-section card">
              <h3 className="checkout-section-title">Contact &amp; Shipping</h3>
              <div className="field">
                <label htmlFor="name">Full Name</label>
                <input id="name" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" required value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="line1">Address</label>
                <input id="line1" required value={form.line1} onChange={(e) => setField('line1', e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="city">City</label>
                  <input id="city" required value={form.city} onChange={(e) => setField('city', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input id="state" required value={form.state} onChange={(e) => setField('state', e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="pincode">Pincode</label>
                  <input
                    id="pincode"
                    required
                    value={form.pincode}
                    onChange={(e) => setField('pincode', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="country">Country</label>
                  <input id="country" required value={form.country} onChange={(e) => setField('country', e.target.value)} />
                </div>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                Save this address for future orders
              </label>
            </div>
          )}

          {!showNewAddressForm && (
            <div className="checkout-section card">
              <h3 className="checkout-section-title">Client Information</h3>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="email-existing">Email (for order confirmation)</label>
                <input
                  id="email-existing"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="checkout-section card">
            <h3 className="checkout-section-title">Delivery Method</h3>
            <div className="checkout-delivery-card">
              <TruckIcon width={20} height={20} />
              <div>
                <p className="checkout-delivery-name">Standard Delivery</p>
                <p className="checkout-delivery-meta">Dispatched within 1-2 business days</p>
              </div>
              <span className="checkout-delivery-price">Free</span>
            </div>
          </div>

          <div className="checkout-section card">
            <h3 className="checkout-section-title">Payment</h3>
            <div className="payment-placeholder">Cash on Delivery — pay when your order arrives. Online payment is coming soon.</div>

            {error && <p className="field-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Placing order…' : `Place Order · ₹${grandTotal.toFixed(2)}`}
            </button>
          </div>
        </form>

        <div className="checkout-summary-col">
          <OrderSummary
            subtotal={total}
            discountAmount={discountAmount}
            couponCode={appliedCoupon?.code}
            total={grandTotal}
            itemsSlot={
              <div className="checkout-summary-items">
                {items.map((item) => (
                  <div key={item.cartItemId} className="checkout-summary-item">
                    <span>
                      {item.productName} · {item.sellingOptionName} × {item.quantity}
                    </span>
                    <span>₹{item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}

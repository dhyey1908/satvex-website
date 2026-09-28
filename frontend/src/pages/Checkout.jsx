import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { orderService } from '../services/orderService';
import { Banknote, Wallet } from 'lucide-react';
import { addressService } from '../services/addressService';
import { authService } from '../services/authService';
import { redirectToCashfreeCheckout } from '../utils/cashfree';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { OrderSummary } from '../components/OrderSummary';
import { AddressCard } from '../components/AddressCard';
import { PageHeader } from '../components/PageHeader';
import { Truck, Loader2, Plus } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { required, minLength, email as validateEmail, phone as validatePhone, sanitizePhoneInput, pincode as validatePincode, runValidators, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Checkout.css';

const CHECKOUT_SERVER_FIELD_MAP = {
  'customer.name': 'name',
  'customer.phone': 'phone',
  'customer.email': 'email',
  'address.line1': 'line1',
  'address.city': 'city',
  'address.state': 'state',
  'address.pincode': 'pincode',
  'address.country': 'country',
};

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
  const { user, refreshUser } = useAuth();
  const { settings, refresh: refreshSettings } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [pincodeLookupState, setPincodeLookupState] = useState('idle');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [quote, setQuote] = useState(null);

  // Refetch settings on entering checkout — SettingsContext fetches once at
  // app mount, which can predate a same-session login, so an allowlisted
  // test user's paymentsOnlineAvailable flag could otherwise be stale.
  useEffect(() => {
    refreshSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Authoritative, backend-computed breakdown (GST/shipping/COD/total) for
  // the currently-selected payment method — never computed on the frontend.
  useEffect(() => {
    let cancelled = false;
    orderService
      .quote({ couponCode: appliedCoupon?.code, paymentMethod })
      .then((data) => !cancelled && setQuote(data))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [appliedCoupon, paymentMethod]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function validate(values, { addressRequired }) {
    if (!addressRequired) {
      return runValidators({ email: () => validateEmail(values.email) });
    }
    return runValidators({
      name: () => minLength(values.name, 2, 'Full name'),
      phone: () => validatePhone(values.phone, { optional: false }),
      email: () => validateEmail(values.email),
      line1: () => minLength(values.line1, 3, 'Address'),
      city: () => minLength(values.city, 2, 'City'),
      state: () => minLength(values.state, 2, 'State'),
      pincode: () => validatePincode(values.pincode),
      country: () => required(values.country, 'Country'),
    });
  }

  useEffect(() => {
    const pincode = form.pincode.trim();
    if (!/^\d{6}$/.test(pincode)) {
      setPincodeLookupState('idle');
      return;
    }
    let cancelled = false;
    setPincodeLookupState('loading');
    const timer = setTimeout(() => {
      fetch(`https://api.postalpincode.in/pincode/${pincode}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const office = data?.[0]?.PostOffice?.[0];
          if (data?.[0]?.Status === 'Success' && office) {
            setForm((prev) => ({ ...prev, city: office.District, state: office.State }));
            setPincodeLookupState('success');
          } else {
            setPincodeLookupState('not-found');
          }
        })
        .catch(() => !cancelled && setPincodeLookupState('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pincode]);

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
    const errors = validate(form, { addressRequired: showNewAddressForm });
    setFieldErrors(errors);
    setTouched(
      showNewAddressForm
        ? { name: true, phone: true, email: true, line1: true, city: true, state: true, pincode: true, country: true }
        : { email: true }
    );
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      const response = await orderService.checkout({
        customer: { name: form.name, phone: form.phone, email: form.email },
        address: {
          line1: form.line1,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          country: form.country,
        },
        couponCode: appliedCoupon?.code,
        paymentMethod,
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

      if (user && (!user.name?.trim() || !user.phone?.trim())) {
        authService
          .updateProfile({ name: user.name?.trim() || form.name, phone: user.phone?.trim() || form.phone })
          .then(refreshUser)
          .catch(() => {});
      }

      clearCoupon();
      await refresh();

      if (paymentMethod === 'Online' && response.paymentSessionId) {
        // Redirects the whole browser to Cashfree's hosted payment page —
        // nothing after this line runs until the customer is redirected
        // back to the return_url set at order creation.
        await redirectToCashfreeCheckout(response.paymentSessionId);
        return;
      }

      showToast('Order placed!', 'success');
      navigate(`/order-confirmation/${response.order.orderId}`);
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err, CHECKOUT_SERVER_FIELD_MAP);
      if (serverErrors) {
        setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
        if (!showNewAddressForm && Object.keys(serverErrors).some((k) => k !== 'email')) {
          setShowNewAddressForm(true);
        }
      } else {
        setError(err.message);
      }
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

  const discountAmount = quote?.discountAmount ?? appliedCoupon?.discountAmount ?? 0;
  const grandTotal = quote?.total ?? Number((total - discountAmount).toFixed(2));

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
                <Plus size={16} /> Add New Address
              </button>
            </div>
          )}

          {showNewAddressForm && (
            <div className="checkout-section card">
              <h3 className="checkout-section-title">Contact &amp; Shipping</h3>
              <div className={`field ${touched.name && fieldErrors.name ? 'invalid' : ''}`}>
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  onBlur={() => markTouched('name')}
                />
                {touched.name && fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              </div>
              <div className="field-row">
                <div className={`field ${touched.phone && fieldErrors.phone ? 'invalid' : ''}`}>
                  <label htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    value={form.phone}
                    onChange={(e) => setField('phone', sanitizePhoneInput(e.target.value))}
                    onBlur={() => markTouched('phone')}
                  />
                  {touched.phone && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                </div>
                <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`}>
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    onBlur={() => markTouched('email')}
                  />
                  {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                </div>
              </div>
              <div className={`field ${touched.line1 && fieldErrors.line1 ? 'invalid' : ''}`}>
                <label htmlFor="line1">Address</label>
                <input
                  id="line1"
                  required
                  value={form.line1}
                  onChange={(e) => setField('line1', e.target.value)}
                  onBlur={() => markTouched('line1')}
                />
                {touched.line1 && fieldErrors.line1 && <p className="field-error">{fieldErrors.line1}</p>}
              </div>
              <div className="field-row">
                <div className={`field ${touched.city && fieldErrors.city ? 'invalid' : ''}`}>
                  <label htmlFor="city">City</label>
                  <input
                    id="city"
                    required
                    value={form.city}
                    onChange={(e) => setField('city', e.target.value)}
                    onBlur={() => markTouched('city')}
                  />
                  {touched.city && fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}
                </div>
                <div className={`field ${touched.state && fieldErrors.state ? 'invalid' : ''}`}>
                  <label htmlFor="state">State</label>
                  <input
                    id="state"
                    required
                    value={form.state}
                    onChange={(e) => setField('state', e.target.value)}
                    onBlur={() => markTouched('state')}
                  />
                  {touched.state && fieldErrors.state && <p className="field-error">{fieldErrors.state}</p>}
                </div>
              </div>
              <div className="field-row">
                <div className={`field ${touched.pincode && fieldErrors.pincode ? 'invalid' : ''}`}>
                  <label htmlFor="pincode">Pincode</label>
                  <input
                    id="pincode"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={form.pincode}
                    onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, ''))}
                    onBlur={() => markTouched('pincode')}
                  />
                  {pincodeLookupState === 'loading' && <p className="field-hint">Looking up city/state…</p>}
                  {pincodeLookupState === 'not-found' && (
                    <p className="field-hint">Couldn&apos;t auto-fill — enter city/state manually.</p>
                  )}
                  {touched.pincode && fieldErrors.pincode && <p className="field-error">{fieldErrors.pincode}</p>}
                </div>
                <div className={`field ${touched.country && fieldErrors.country ? 'invalid' : ''}`}>
                  <label htmlFor="country">Country</label>
                  <input
                    id="country"
                    required
                    value={form.country}
                    onChange={(e) => setField('country', e.target.value)}
                    onBlur={() => markTouched('country')}
                  />
                  {touched.country && fieldErrors.country && <p className="field-error">{fieldErrors.country}</p>}
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
              <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`} style={{ marginBottom: 0 }}>
                <label htmlFor="email-existing">Email (for order confirmation)</label>
                <input
                  id="email-existing"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  onBlur={() => markTouched('email')}
                />
                {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
              </div>
            </div>
          )}

          <div className="checkout-section card">
            <h3 className="checkout-section-title">Delivery Method</h3>
            <div className="checkout-delivery-card">
              <Truck size={20} />
              <div>
                <p className="checkout-delivery-name">Standard Delivery</p>
                <p className="checkout-delivery-meta">Dispatched within 1-2 business days</p>
              </div>
              <span className="checkout-delivery-price">
                {quote && quote.shippingEnabled && quote.shipping > 0 ? `₹${quote.shipping.toFixed(2)}` : 'Free'}
              </span>
            </div>
          </div>

          <div className="checkout-section card">
            <h3 className="checkout-section-title">Payment</h3>
            <div className="payment-method-options">
              <label className={`payment-method-option ${paymentMethod === 'COD' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                />
                <Banknote size={18} />
                <div>
                  <p className="payment-method-name">Cash on Delivery</p>
                  <p className="payment-method-meta">
                    Pay when your order arrives.
                    {quote?.codCharge > 0 && ` An extra ₹${quote.codCharge.toFixed(2)} COD charge applies.`}
                  </p>
                </div>
              </label>
              {settings?.paymentsOnlineAvailable && (
                <label className={`payment-method-option ${paymentMethod === 'Online' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="Online"
                    checked={paymentMethod === 'Online'}
                    onChange={() => setPaymentMethod('Online')}
                  />
                  <Wallet size={18} />
                  <div>
                    <p className="payment-method-name">Online Payment</p>
                    <p className="payment-method-meta">UPI / Card — no extra charge.</p>
                  </div>
                </label>
              )}
            </div>

            {error && <p className="field-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="btn-spinner" /> : `Place Order · ₹${grandTotal.toFixed(2)}`}
            </button>
          </div>
        </form>

        <div className="checkout-summary-col">
          <OrderSummary
            subtotal={quote?.subtotal ?? total}
            discountAmount={discountAmount}
            couponCode={appliedCoupon?.code}
            gstPercent={quote?.gstPercent}
            gstAmount={quote?.gstAmount}
            shippingEnabled={quote?.shippingEnabled}
            shipping={quote?.shipping}
            codCharge={quote?.codCharge}
            total={grandTotal}
            itemsSlot={
              <div className="checkout-summary-items">
                {items.map((item) => (
                  <div key={item.cartItemId} className="checkout-summary-item">
                    <img
                      className="checkout-summary-item-image"
                      src={item.productImage}
                      alt={item.productName}
                      loading="lazy"
                    />
                    <span className="checkout-summary-item-info">
                      {item.productName} · {item.sellingOptionName} × {item.quantity}
                    </span>
                    <span className="checkout-summary-item-price">₹{item.subtotal.toFixed(2)}</span>
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

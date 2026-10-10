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
import { useConfirm } from '../context/ConfirmContext';
import { EmptyState } from '../components/EmptyState';
import { OrderSummary } from '../components/OrderSummary';
import { FreeShippingBanner } from '../components/FreeShippingBanner';
import { AddressCard } from '../components/AddressCard';
import { AddressFormFields, ADDRESS_FORM_EMPTY, addressFormToPayload, validateAddressForm } from '../components/AddressFormFields';
import { PageHeader } from '../components/PageHeader';
import { Truck, Loader2, Plus, Check, ChevronLeft } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { required, minLength, email as validateEmail, phone as validatePhone, pincode as validatePincode, runValidators, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Checkout.css';

const CHECKOUT_SERVER_FIELD_MAP = {
  'customer.name': 'fullName',
  'customer.phone': 'phone',
  'customer.email': 'email',
  'address.line1': 'houseFlat',
  'address.city': 'city',
  'address.state': 'state',
  'address.pincode': 'pincode',
  'address.country': 'country',
};

export function Checkout() {
  useDocumentMeta({ title: 'Checkout', path: '/checkout' });

  const { items, total, refresh, appliedCoupon, clearCoupon } = useCart();
  const { user, refreshUser } = useAuth();
  const { settings, refresh: refreshSettings } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...ADDRESS_FORM_EMPTY });
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [showAddressList, setShowAddressList] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [pincodeLookupState, setPincodeLookupState] = useState('idle');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [quote, setQuote] = useState(null);
  const [step, setStep] = useState('address');
  const STEPS = [
    { key: 'address', label: 'Address' },
    { key: 'confirm', label: 'Confirm Details' },
    { key: 'payment', label: 'Payment' },
  ];

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

  // Authoritative, backend-computed breakdown (GST/shipping/COD/total) —
  // never computed on the frontend. Includes the delivery pincode as soon
  // as one is known (a selected saved address, or a fully-typed new one) so
  // the real Shiprocket-rate shipping charge shows well before the Payment
  // step, not just a flat guess — without a pincode yet, the backend still
  // returns a usable quote via its own flat fallback charge.
  const selectedAddressForQuote = addresses?.find((a) => a.addressId === selectedAddressId);
  const typedPincode = form.pincode.trim();
  const deliveryPincode =
    selectedAddressForQuote && !showNewAddressForm
      ? selectedAddressForQuote.pincode
      : /^\d{6}$/.test(typedPincode)
      ? typedPincode
      : undefined;

  useEffect(() => {
    let cancelled = false;
    orderService
      .quote({ couponCode: appliedCoupon?.code, paymentMethod, pincode: deliveryPincode })
      .then((data) => !cancelled && setQuote(data))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [appliedCoupon, paymentMethod, deliveryPincode]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function validate(addressRequired) {
    if (!addressRequired) {
      return runValidators({ email: () => validateEmail(email) });
    }
    return {
      ...validateAddressForm(form, { required, minLength, phone: validatePhone, pincode: validatePincode }),
      email: validateEmail(email),
    };
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
    setShowAddressList(false);
    setForm({
      ...ADDRESS_FORM_EMPTY,
      label: addr.label,
      fullName: addr.fullName,
      phone: addr.phone,
      houseFlat: addr.line1,
      areaStreet: '',
      landmark: addr.landmark || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
    });
  }

  function startNewAddress() {
    setSelectedAddressId(null);
    setShowNewAddressForm(true);
    setShowAddressList(false);
    setForm({ ...ADDRESS_FORM_EMPTY });
  }

  async function handleDeleteAddress(id) {
    const ok = await confirm({
      title: 'Delete this address?',
      message: 'This address will be permanently removed from your account.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await addressService.remove(id);
      const { addresses: list } = await addressService.list();
      setAddresses(list);
      if (selectedAddressId === id) {
        const next = list.find((a) => a.isDefault) || list[0];
        if (next) applyAddress(next);
        else startNewAddress();
      }
      showToast('Address deleted', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function handleContinueFromAddress() {
    const addressRequired = showNewAddressForm || Boolean(selectedAddressId);
    const errors = validate(addressRequired);
    setFieldErrors(errors);
    setTouched(
      addressRequired
        ? { fullName: true, phone: true, email: true, houseFlat: true, areaStreet: true, city: true, state: true, pincode: true, country: true }
        : { email: true }
    );
    if (hasErrors(errors)) return;
    setStep('confirm');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToStep(key) {
    setStep(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const addressRequired = showNewAddressForm || Boolean(selectedAddressId);
    const errors = validate(addressRequired);
    setFieldErrors(errors);
    setTouched(
      addressRequired
        ? { fullName: true, phone: true, email: true, houseFlat: true, areaStreet: true, city: true, state: true, pincode: true, country: true }
        : { email: true }
    );
    if (hasErrors(errors)) {
      setStep('address');
      return;
    }

    setSubmitting(true);
    try {
      const addressPayload = addressFormToPayload(form);
      const response = await orderService.checkout({
        customer: { name: form.fullName, phone: form.phone, email },
        address: {
          line1: addressPayload.line1,
          landmark: addressPayload.landmark,
          city: addressPayload.city,
          state: addressPayload.state,
          pincode: addressPayload.pincode,
          country: addressPayload.country,
        },
        couponCode: appliedCoupon?.code,
        paymentMethod,
      });

      if (saveAddress && !selectedAddressId) {
        addressService.create(addressPayload).catch(() => {});
      }

      if (user && (!user.name?.trim() || !user.phone?.trim())) {
        authService
          .updateProfile({ name: user.name?.trim() || form.fullName, phone: user.phone?.trim() || form.phone })
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
        setStep('address');
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
  const selectedAddress = addresses?.find((a) => a.addressId === selectedAddressId);
  const productSavings = items.reduce(
    (sum, item) => sum + (item.compareAtPrice > item.unitPrice ? (item.compareAtPrice - item.unitPrice) * item.quantity : 0),
    0
  );
  const savingsAmount = productSavings + discountAmount;
  // The address the Confirm step shows — either the saved card the customer
  // picked, or a live preview built from the still-unsaved new-address form
  // so the summary never lags behind what will actually be submitted.
  const confirmAddress =
    selectedAddress && !showNewAddressForm
      ? selectedAddress
      : { ...addressFormToPayload(form), fullName: form.fullName, phone: form.phone, label: form.label };
  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="container section checkout-page">
      <Link to="/cart" className="checkout-return-link text-label-sm">← Return to Bag</Link>
      <PageHeader title="Secure Checkout" />

      <ol className="checkout-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`checkout-step ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'done' : ''}`}>
            <span className="checkout-step-dot">{i < currentStepIndex ? <Check size={13} /> : i + 1}</span>
            <span className="checkout-step-label">{s.label}</span>
            {i < STEPS.length - 1 && <span className="checkout-step-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          {step === 'address' && (
            <>
              <div className="checkout-section card">
                <h3 className="checkout-section-title">Delivery Address</h3>

                {selectedAddress && !showAddressList && !showNewAddressForm && (
                  <>
                    <AddressCard address={selectedAddress} selected />
                    <div className="checkout-address-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddressList(true)}>
                        Change
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={startNewAddress}>
                        <Plus size={14} /> Add New
                      </button>
                    </div>
                  </>
                )}

                {addresses && addresses.length > 0 && showAddressList && (
                  <>
                    <div className="checkout-address-grid">
                      {addresses.map((addr) => (
                        <AddressCard
                          key={addr.addressId}
                          address={addr}
                          selected={selectedAddressId === addr.addressId}
                          onSelect={() => applyAddress(addr)}
                          onDelete={() => handleDeleteAddress(addr.addressId)}
                        />
                      ))}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={startNewAddress} style={{ marginTop: 12 }}>
                      <Plus size={16} /> Add New Address
                    </button>
                  </>
                )}

                {showNewAddressForm && (
                  <>
                    <AddressFormFields
                      form={form}
                      setField={setField}
                      touched={touched}
                      markTouched={markTouched}
                      fieldErrors={fieldErrors}
                      pincodeLookupState={pincodeLookupState}
                    />
                    <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`}>
                      <label htmlFor="email">Email (for order confirmation)</label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => markTouched('email')}
                      />
                      {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                    </div>
                    <label className="checkbox-field">
                      <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                      Save this address for future orders
                    </label>
                    {addresses && addresses.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={() => (selectedAddress ? applyAddress(selectedAddress) : setShowAddressList(true))}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </div>

              {selectedAddress && !showNewAddressForm && (
                <div className="checkout-section card">
                  <h3 className="checkout-section-title">Contact Email</h3>
                  <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`} style={{ marginBottom: 0 }}>
                    <label htmlFor="email-existing">Email (for order confirmation)</label>
                    <input
                      id="email-existing"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => markTouched('email')}
                    />
                    {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                  </div>
                </div>
              )}

              <button type="button" className="btn btn-primary btn-block checkout-step-continue" onClick={handleContinueFromAddress}>
                Continue
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button type="button" className="checkout-back-link" onClick={() => goToStep('address')}>
                <ChevronLeft size={16} /> Back to Address
              </button>

              <div className="checkout-section card">
                <h3 className="checkout-section-title">Delivery Address</h3>
                <AddressCard address={confirmAddress} selected />
                <div className="checkout-address-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => goToStep('address')}>
                    Change
                  </button>
                </div>
              </div>

              <div className="checkout-section card">
                <h3 className="checkout-section-title">Order Items</h3>
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
                        <span className="checkout-summary-item-name">
                          {item.productName} · {item.sellingOptionName} × {item.quantity}
                        </span>
                        {item.selectedColorDetails?.length > 0 && (
                          <span className="checkout-summary-item-colors">
                            {item.selectedColorDetails.map((c) => c.colorName).join(', ')}
                          </span>
                        )}
                      </span>
                      <span className="checkout-summary-item-price">₹{item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

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

              <button type="button" className="btn btn-primary btn-block checkout-step-continue" onClick={() => goToStep('payment')}>
                Continue to Payment
              </button>
            </>
          )}

          {step === 'payment' && (
            <>
              <button type="button" className="checkout-back-link" onClick={() => goToStep('confirm')}>
                <ChevronLeft size={16} /> Back
              </button>

              <div className="checkout-section card">
                <h3 className="checkout-section-title">Payment Method</h3>
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

                <button type="submit" className="btn btn-primary btn-block checkout-place-order" disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="btn-spinner" /> : `Place Order · ₹${grandTotal.toFixed(2)}`}
                </button>
              </div>
            </>
          )}
        </form>

        <div className="checkout-summary-col">
          <FreeShippingBanner quote={quote} />
          <OrderSummary
            subtotal={quote?.subtotal ?? total}
            discountAmount={discountAmount}
            couponCode={appliedCoupon?.code}
            gstPercent={quote?.gstPercent}
            gstAmount={quote?.gstAmount}
            shippingEnabled={quote?.shippingEnabled}
            shipping={quote?.shipping}
            codCharge={quote?.codCharge}
            prepaidDiscount={quote?.prepaidDiscount}
            total={grandTotal}
            savingsAmount={savingsAmount}
          />
        </div>
      </div>

      <div className="checkout-mobile-bar">
        <div className="checkout-mobile-bar-total">
          <span className="checkout-mobile-bar-amount">₹{grandTotal.toFixed(2)}</span>
          {savingsAmount > 0 && <span className="checkout-mobile-bar-savings">Saved ₹{savingsAmount.toFixed(2)}</span>}
        </div>
        {step === 'address' && (
          <button type="button" className="btn btn-primary checkout-mobile-bar-cta" onClick={handleContinueFromAddress}>
            Continue
          </button>
        )}
        {step === 'confirm' && (
          <button type="button" className="btn btn-primary checkout-mobile-bar-cta" onClick={() => goToStep('payment')}>
            Continue
          </button>
        )}
        {step === 'payment' && (
          <button type="button" className="btn btn-primary checkout-mobile-bar-cta" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Place Order'}
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { orderService } from '../services/orderService';
import { Banknote, Wallet } from 'lucide-react';
import { addressService } from '../services/addressService';
import { authService } from '../services/authService';
import { redirectToPayuCheckout } from '../utils/payu';
import { waitForMinimum } from '../utils/minimumDelay';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { EmptyState } from '../components/EmptyState';
import { CouponInput } from '../components/CouponInput';
import { CouponCelebration } from '../components/CouponCelebration';
import { OrderSummary } from '../components/OrderSummary';
import { FreeShippingBanner } from '../components/FreeShippingBanner';
import { AddressCard } from '../components/AddressCard';
import { PhoneVerification } from '../components/PhoneVerification';
import { AddressFormFields, ADDRESS_FORM_EMPTY, addressFormToPayload, validateAddressForm } from '../components/AddressFormFields';
import { PageHeader } from '../components/PageHeader';
import { Truck, Loader2, Plus, Sparkles, Lock, PackageCheck } from 'lucide-react';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { required, minLength, phone as validatePhone, pincode as validatePincode, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import { isPhoneVerifiedFor } from '../utils/phoneVerification';
import './Checkout.css';

const CHECKOUT_SERVER_FIELD_MAP = {
  'customer.name': 'fullName',
  'customer.phone': 'phone',
  'address.line1': 'houseFlat',
  'address.city': 'city',
  'address.state': 'state',
  'address.pincode': 'pincode',
  'address.country': 'country',
};

export function Checkout() {
  useDocumentMeta({ title: 'Checkout', path: '/checkout', noindex: true });

  const { items, total, refresh, appliedCoupon, applyCoupon, clearCoupon } = useCart();
  const { user, refreshUser } = useAuth();
  const { settings, refresh: refreshSettings } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...ADDRESS_FORM_EMPTY });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Non-null once the order has been created — see handleSubmit. The label
  // shown while the browser is being sent to PayU / the confirmation page.
  const [redirecting, setRedirecting] = useState(null);
  const createdOrderIdRef = useRef(null);
  // The one-time COD confirmation (COD charge + "pay online and save").
  // codConfirmedRef lets "Continue with COD" re-run handleSubmit past it.
  const [codConfirmOpen, setCodConfirmOpen] = useState(false);
  const codConfirmedRef = useRef(false);
  // Synchronous guard: state updates are async, so a fast double-tap could
  // otherwise start two orders before `submitting` is rendered as true.
  const submitLockRef = useRef(false);

  const [addresses, setAddresses] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [showAddressList, setShowAddressList] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [pincodeLookupState, setPincodeLookupState] = useState('idle');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  // Which inputs (coupon, payment method, pincode) the current `quote` was
  // computed for. A quote only counts as the customer's total when this matches
  // the CURRENT inputs - otherwise it is stale (the old payment method's price)
  // and must neither be shown nor submitted.
  const [quoteKey, setQuoteKey] = useState(null);
  const [quoteRefreshToken, setQuoteRefreshToken] = useState(0);
  // Mandatory before placing the order — gated by PhoneVerification's own
  // onVerified, which only fires once the backend actually confirms (via
  // otpService/userService.isPhoneVerified, 30-day window included). Reset
  // to false whenever the effective address phone changes below.
  const [confirmPhoneVerified, setConfirmPhoneVerified] = useState(false);
  // Increments only once the backend has actually confirmed a coupon
  // applied — never for an invalid code, a repeated click, or a failed
  // request (CouponInput only calls onApply when it's showing the "not yet
  // applied" form, and only resolves without throwing on success).
  const [couponCelebrationTrigger, setCouponCelebrationTrigger] = useState(0);
  const paymentMethodAutoSet = useRef(false);
  const addressCardRef = useRef(null);
  const phoneCardRef = useRef(null);
  // Tracks the last delivery-quote error already shown as a toast, so the
  // quote effect re-running for an unrelated reason (coupon/payment method
  // change) while the SAME undeliverable pincode is still entered doesn't
  // re-toast the identical message on every fetch.
  const lastToastedDeliveryErrorRef = useRef(null);

  // Matches AddressFormFields' actual top-to-bottom render order (not
  // validateAddressForm's object-key order, which lists pincode after
  // houseFlat/areaStreet even though it renders before them) — so when
  // several fields are invalid at once, this lands on whichever one the
  // customer would actually reach first scrolling down the card.
  const ADDRESS_FIELD_ORDER = ['fullName', 'phone', 'pincode', 'houseFlat', 'areaStreet', 'city', 'state', 'country'];

  // window.scrollTo({top: 0}) looked like it "did nothing" because the
  // fixed header (--header-height) sits on top of whatever lands at y=0,
  // covering the card's title and first few fields. This scrolls a
  // specific element into view with room left for that header instead.
  function scrollToElement(el) {
    if (!el) return;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 68;
    const targetY = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
    window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
  }

  function scrollToCard(ref) {
    scrollToElement(ref.current);
  }

  // Scrolls to (and focuses) the first actually-invalid field in visual
  // order, not just the top of the card — a tall card with e.g. only
  // "Area / Street" empty shouldn't leave the customer to go hunting for
  // which field has the red border. Falls back to the card itself if
  // nothing in errors matches a known field (shouldn't normally happen).
  function scrollToFirstError(errors) {
    const key = ADDRESS_FIELD_ORDER.find((k) => errors[k]);
    const el = key && document.getElementById(`address-${key}`);
    if (el) {
      scrollToElement(el);
      el.focus({ preventScroll: true });
    } else {
      scrollToCard(addressCardRef);
    }
  }

  // Refetch settings on entering checkout — SettingsContext fetches once at
  // app mount, which can predate a same-session login, so an allowlisted
  // test user's paymentsOnlineAvailable flag could otherwise be stale.
  useEffect(() => {
    refreshSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Name/phone prefill from the account when there's no saved address to
  // prefill them from instead (a saved address's own name/phone is the
  // more specific, likely more accurate choice for that address). Never
  // clobbers something the customer already typed.
  useEffect(() => {
    if (!user) return;
    if (!selectedAddressId) {
      setForm((prev) => ({
        ...prev,
        fullName: prev.fullName || user.name || '',
        phone: prev.phone || user.phone || '',
      }));
    }
  }, [user, selectedAddressId]);

  // Hoisted above the items.length===0 early return below, alongside every
  // other hook (confirmAddress itself, further down, is fine to compute
  // after the early return since it's a plain value, not a hook).
  const selectedAddress = addresses?.find((a) => a.addressId === selectedAddressId);
  const confirmPhoneForEffect = selectedAddress && !showNewAddressForm ? selectedAddress.phone : form.phone;
  // A different number is never silently treated as verified — but if the
  // address phone is exactly the number this account already verified
  // (within the backend's 30-day window), it starts out verified, so the
  // customer isn't asked to click "Verify" just to be told it's already
  // done. Re-runs when `user` refreshes after a fresh verification too.
  useEffect(() => {
    setConfirmPhoneVerified(isPhoneVerifiedFor(user, confirmPhoneForEffect));
  }, [confirmPhoneForEffect, user]);

  // The holding screen replaces the whole page at the SAME URL, so no route
  // change happens (ScrollToTop never fires) — without this it would sit
  // wherever the long checkout form had been scrolled to.
  useEffect(() => {
    if (redirecting) window.scrollTo(0, 0);
  }, [redirecting]);

  // Browser Back from PayU's page restores this page from the back/forward
  // cache exactly as it was — frozen on the "Redirecting…" screen forever.
  // The order already exists, so send the customer to it instead.
  useEffect(() => {
    function onPageShow(event) {
      if (event.persisted && createdOrderIdRef.current) {
        navigate(`/account/orders/${createdOrderIdRef.current}`, { replace: true });
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [navigate]);

  // Online is the preselected payment method whenever it's actually
  // available for this customer — COD remains fully available, just no
  // longer the default. Runs once, the first time paymentsOnlineAvailable
  // resolves true, so it never clobbers a choice the customer already made
  // (e.g. switching to COD) on a later settings refresh.
  useEffect(() => {
    if (settings?.paymentsOnlineAvailable && !paymentMethodAutoSet.current) {
      paymentMethodAutoSet.current = true;
      setPaymentMethod('Online');
    }
  }, [settings?.paymentsOnlineAvailable]);

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

  const currentQuoteKey = JSON.stringify([appliedCoupon?.code || '', paymentMethod, deliveryPincode || '']);

  useEffect(() => {
    let cancelled = false;
    orderService
      .quote({ couponCode: appliedCoupon?.code, paymentMethod, pincode: deliveryPincode })
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setQuoteKey(currentQuoteKey);
        setQuoteError(null);
        lastToastedDeliveryErrorRef.current = null;
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteKey(null);
        // Surfaced prominently (e.g. a disabled-state pincode) rather than
        // silently dropped — the customer needs to know why the total
        // disappeared and can't just guess. A toast catches it immediately
        // even if they've already scrolled past the inline message below
        // the address card.
        const message = deliveryPincode ? err.message : null;
        setQuoteError(message);
        if (message && message !== lastToastedDeliveryErrorRef.current) {
          showToast(message, 'error');
          lastToastedDeliveryErrorRef.current = message;
        } else if (!message) {
          lastToastedDeliveryErrorRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appliedCoupon, paymentMethod, deliveryPincode, quoteRefreshToken]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function validate(addressRequired) {
    if (!addressRequired) return {};
    return validateAddressForm(form, { required, minLength, phone: validatePhone, pincode: validatePincode });
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

  async function handleApplyCoupon(code) {
    const result = await applyCoupon(code);
    setCouponCelebrationTrigger((n) => n + 1);
    return result;
  }

  // methodOverride lets the COD confirmation's "Pay online & save" button
  // place the order as Online in one step, without waiting for the
  // paymentMethod state change to land first.
  async function handleSubmit(e, methodOverride) {
    e?.preventDefault?.();
    setError(null);
    const method = methodOverride || paymentMethod;
    // Sole enforcement point now that there's no step left to skip past —
    // the Place Order button is already disabled until this is true, but
    // this catches a forced bypass (e.g. devtools re-enabling the button).
    if (!confirmPhoneVerified) {
      showToast('Please verify your mobile number before placing the order.', 'warning');
      scrollToCard(phoneCardRef);
      return;
    }
    const addressRequired = showNewAddressForm || Boolean(selectedAddressId);
    const errors = validate(addressRequired);
    setFieldErrors(errors);
    setTouched(
      addressRequired
        ? { fullName: true, phone: true, houseFlat: true, areaStreet: true, city: true, state: true, pincode: true, country: true }
        : {}
    );
    if (hasErrors(errors)) {
      scrollToFirstError(errors);
      return;
    }
    // Already know this pincode/address isn't deliverable (set by the quote
    // effect) — block right here instead of letting the customer submit
    // into a guaranteed backend rejection. Same message already shown
    // inline below the address card; this just makes it impossible to miss.
    if (quoteError) {
      showToast(quoteError, 'error');
      scrollToElement(document.getElementById('address-pincode'));
      return;
    }

    // Never place an order against a total that isn't the one for the CURRENT
    // payment method / coupon / pincode. (The "switch to prepaid" button
    // submits Online before the method state has caught up - its price is the
    // server's own prepaidOffer.onlineTotal, checked below.)
    const switchingMethod = Boolean(methodOverride) && methodOverride !== paymentMethod;
    if (!switchingMethod && !quoteIsCurrent) {
      showToast('Updating your total — please try again in a moment.', 'info');
      return;
    }

    // COD confirmation: once, after everything above has passed (so it never
    // interrupts a form that still has errors). Surfaces the COD charge and,
    // when prepaid is cheaper, the saving — the aim is to steer customers to
    // prepaid. "Continue with COD" re-enters here with the flag set.
    const codNeedsConfirm = Boolean(quote?.codCharge > 0 || quote?.prepaidOffer?.savings > 0);
    if (method === 'COD' && codNeedsConfirm && !codConfirmedRef.current) {
      setCodConfirmOpen(true);
      return;
    }
    codConfirmedRef.current = false;

    if (submitLockRef.current) return;
    submitLockRef.current = true;
    const startedAt = Date.now();
    setSubmitting(true);
    let createdOrderId = null;
    try {
      const addressPayload = addressFormToPayload(form);
      const response = await orderService.checkout({
        customer: { name: form.fullName, phone: form.phone },
        address: {
          line1: addressPayload.line1,
          landmark: addressPayload.landmark,
          city: addressPayload.city,
          state: addressPayload.state,
          pincode: addressPayload.pincode,
          country: addressPayload.country,
        },
        couponCode: appliedCoupon?.code,
        paymentMethod: method,
        // The total on the customer's screen. The server still prices the
        // order itself and refuses (409 PRICE_CHANGED) if it would differ.
        expectedTotal: switchingMethod ? quote?.prepaidOffer?.onlineTotal : quote?.total,
      });

      // The order now exists and the server has emptied the cart. From here
      // on this page must never fall through to the "Your cart is empty"
      // state below — hold a dedicated screen until the browser has actually
      // left (PayU redirect) or navigated (COD), neither of which is instant.
      createdOrderId = response.order.orderId;
      createdOrderIdRef.current = createdOrderId;
      setRedirecting(
        method === 'Online' && response.payuParams ? 'Redirecting you to secure payment…' : 'Placing your order…'
      );

      // A fast order still gets a moment of the loader (success path only;
      // every error path above/below clears it at once).
      await waitForMinimum(startedAt);

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
      try {
        await refresh();
      } catch {
        // Best-effort: the order is already placed, so a failed cart
        // re-fetch must not derail the payment redirect / confirmation.
      }

      if (method === 'Online' && response.payuParams) {
        // Redirects the whole browser to PayU's hosted payment page —
        // nothing after this line runs until the customer is redirected
        // back via the backend's surl/furl callback.
        await redirectToPayuCheckout(response.payuParams);
        return;
      }

      showToast('Order placed!', 'success');
      navigate(`/order-confirmation/${response.order.orderId}`);
    } catch (err) {
      if (createdOrderId) {
        // Failed AFTER the order was created (e.g. the payment redirect
        // itself) — the cart is already empty, so staying here would leave
        // a dead "empty cart" page. The order detail page has Retry Payment.
        showToast('Your order was placed, but we could not open the payment page. You can pay from your order.', 'error');
        navigate(`/account/orders/${createdOrderId}`);
        return;
      }
      setRedirecting(null);
      if (err.code === 'PRICE_CHANGED') {
        // Show the new price and make the customer confirm it again.
        codConfirmedRef.current = false;
        setCodConfirmOpen(false);
        setQuoteKey(null);
        setQuoteRefreshToken((n) => n + 1);
        setError(err.message);
        showToast(err.message, 'warning');
        return;
      }
      if (err.code === 'ADDRESS_STATE_MISMATCH') {
        setFieldErrors((prev) => ({ ...prev, state: err.message }));
        setTouched((prev) => ({ ...prev, state: true }));
        setShowNewAddressForm(true);
        showToast(err.message, 'error');
        scrollToElement(document.getElementById('address-state'));
        return;
      }
      const serverErrors = mapServerFieldErrors(err, CHECKOUT_SERVER_FIELD_MAP);
      if (serverErrors) {
        setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
        if (!showNewAddressForm && Object.keys(serverErrors).length > 0) {
          setShowNewAddressForm(true);
        }
        showToast('Please check your delivery address details.', 'error');
        scrollToFirstError(serverErrors);
      } else {
        setError(err.message);
        showToast(err.message, 'error');
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  // Same full-screen overlay as the in-flight state rendered below, so the
  // moment the order is created the screen doesn't visibly change — it just
  // updates its label.
  if (redirecting) {
    return (
      <div className="checkout-placing-overlay">
        <Loader label={redirecting} />
      </div>
    );
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
  // grandTotal above is only a layout placeholder until the server's quote for
  // the current inputs arrives - this is what decides whether it may be SHOWN.
  const quoteIsCurrent = Boolean(quote) && quoteKey === currentQuoteKey;
  const totalPending = !quoteIsCurrent && !quoteError;
  const totalLabel = quoteIsCurrent ? `₹${grandTotal.toFixed(2)}` : '…';
  // Server-computed "pay online and save" comparison (null when online
  // payment isn't available to this customer) — display only.
  const prepaidOffer = quote?.prepaidOffer ?? null;

  function continueWithCod() {
    codConfirmedRef.current = true;
    setCodConfirmOpen(false);
    handleSubmit(null);
  }

  function payOnlineInstead() {
    setCodConfirmOpen(false);
    setPaymentMethod('Online');
    handleSubmit(null, 'Online');
  }
  const productSavings = items.reduce(
    (sum, item) => sum + (item.compareAtPrice > item.unitPrice ? (item.compareAtPrice - item.unitPrice) * item.quantity : 0),
    0
  );
  const savingsAmount = productSavings + discountAmount;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  // Feeds PhoneVerification's phone prop — either the saved address the
  // customer picked, or a live preview built from the still-unsaved
  // new-address form so it never lags behind what will actually be
  // submitted.
  const confirmAddress =
    selectedAddress && !showNewAddressForm
      ? selectedAddress
      : { ...addressFormToPayload(form), fullName: form.fullName, phone: form.phone, label: form.label };

  return (
    <div className="container section checkout-page">
      <Link to="/cart" className="checkout-return-link text-label-sm">← Return to Bag</Link>
      <PageHeader title="Secure Checkout" />
      <FreeShippingBanner quote={quote} />

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit} noValidate>
          <div className="checkout-section card" ref={addressCardRef}>
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

          {quoteError && <p className="field-error checkout-delivery-error">{quoteError}</p>}

          <div className="checkout-section card" ref={phoneCardRef}>
            <h3 className="checkout-section-title">Verify Mobile Number</h3>
            <PhoneVerification
              key={confirmAddress.phone}
              phone={confirmAddress.phone}
              verified={confirmPhoneVerified}
              onVerified={() => {
                setConfirmPhoneVerified(true);
                // Pull the account's new verifiedPhone/phoneVerifiedAt so
                // the already-verified check above stays accurate if the
                // address phone is switched away and back again.
                refreshUser();
              }}
            />
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

          <div className="checkout-section card">
            <h3 className="checkout-section-title">Have a Coupon?</h3>
            <CouponInput appliedCoupon={appliedCoupon} onApply={handleApplyCoupon} onClear={clearCoupon} />
          </div>

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
                <Banknote size={16} />
                <div>
                  <p className="payment-method-name">Cash on Delivery</p>
                  <p className="payment-method-meta">
                    Pay on delivery.
                    {quote?.codCharge > 0 && ` +₹${quote.codCharge.toFixed(2)} COD charge.`}
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
                  <Wallet size={16} />
                  <div>
                    <p className="payment-method-name">
                      Online Payment
                      {prepaidOffer?.savings > 0 && (
                        <span className="payment-offer-pill">
                          <Sparkles size={11} /> Save ₹{prepaidOffer.savings.toFixed(2)}
                        </span>
                      )}
                    </p>
                    <p className="payment-method-meta">UPI / Cards · secure online payment</p>
                    {/* The offer itemised, right on the option — not just one
                        combined "Save" figure. */}
                    {(prepaidOffer?.codCharge > 0 || prepaidOffer?.prepaidDiscount > 0) && (
                      <ul className="payment-offer-list">
                        {prepaidOffer.codCharge > 0 && <li>No COD charge — ₹{prepaidOffer.codCharge.toFixed(2)} saved</li>}
                        {prepaidOffer.prepaidDiscount > 0 && (
                          <li>₹{prepaidOffer.prepaidDiscount.toFixed(2)} prepaid offer</li>
                        )}
                      </ul>
                    )}
                  </div>
                </label>
              )}
            </div>

            {paymentMethod === 'COD' && prepaidOffer?.savings > 0 && (
              <div className="payment-offer-banner">
                <Sparkles size={16} />
                <p>
                  Pay online and save <strong>₹{prepaidOffer.savings.toFixed(2)}</strong>
                  {prepaidOffer.codCharge > 0 && ` — skip the ₹${prepaidOffer.codCharge.toFixed(2)} COD charge`}
                  {prepaidOffer.prepaidDiscount > 0 && ` and get ₹${prepaidOffer.prepaidDiscount.toFixed(2)} off`}.
                </p>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaymentMethod('Online')}>
                  Switch to Prepaid
                </button>
              </div>
            )}

            {/* Each line restates a policy the store already publishes (PayU checkout,
                Shipping Policy dispatch window, Returns & Refunds damaged/wrong-item
                cover) — keep them in sync with those pages. */}
            <ul className="payment-trust-list">
              <li><Lock size={15} aria-hidden="true" /> Secure payments powered by PayU</li>
              <li><Truck size={15} aria-hidden="true" /> Dispatched in 1–2 business days, tracked across India</li>
              <li>
                <PackageCheck size={15} aria-hidden="true" /> Damaged or wrong item? We&apos;ll replace or refund —{' '}
                <a href="/returns-refunds" target="_blank" rel="noreferrer">see policy</a>
              </li>
            </ul>

            {error && <p className="field-error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary btn-block checkout-place-order"
              disabled={submitting || totalPending}
            >
              {submitting ? (
                <Loader2 size={16} className="btn-spinner" />
              ) : quoteIsCurrent ? (
                `Place Order · ${totalLabel}`
              ) : (
                'Updating total…'
              )}
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
            prepaidDiscount={quote?.prepaidDiscount}
            total={grandTotal}
            pending={totalPending}
            savingsAmount={savingsAmount}
            itemCount={itemCount}
            defaultExpanded={false}
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
            }
          />
        </div>
      </div>

      <div className="checkout-mobile-bar">
        <div className="checkout-mobile-bar-total">
          <span className="checkout-mobile-bar-amount">{totalLabel}</span>
          {savingsAmount > 0 && <span className="checkout-mobile-bar-savings">Saved ₹{savingsAmount.toFixed(2)}</span>}
        </div>
        <button
          type="button"
          className="btn btn-primary checkout-mobile-bar-cta"
          onClick={handleSubmit}
          disabled={submitting || totalPending}
        >
          {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Place Order'}
        </button>
      </div>

      {/* Shown the instant Place Order is clicked (while the order request is
          in flight) so the customer never sits on the form wondering if it
          worked. A fixed overlay, not a page swap: if the request fails
          (e.g. delivery unavailable) the form is still right there,
          scrolled exactly where they were. */}
      {submitting && (
        <div className="checkout-placing-overlay">
          <Loader label="Placing your order…" />
        </div>
      )}

      <Modal open={codConfirmOpen} onClose={() => setCodConfirmOpen(false)} title="Confirm Cash on Delivery">
        <div className="cod-confirm">
          <p className="cod-confirm-total">
            Your order total is <strong>₹{grandTotal.toFixed(2)}</strong>
            {quote?.codCharge > 0 && (
              <>
                {' '}
                including a <strong>₹{quote.codCharge.toFixed(2)} COD charge</strong>
              </>
            )}
            .
          </p>

          {prepaidOffer?.savings > 0 && (
            <div className="cod-confirm-offer">
              <Sparkles size={20} />
              <div>
                <strong>Switch to Prepaid and save ₹{prepaidOffer.savings.toFixed(2)}</strong>
                <ul className="payment-offer-list payment-offer-list-modal">
                  {prepaidOffer.codCharge > 0 && <li>No COD charge — ₹{prepaidOffer.codCharge.toFixed(2)} saved</li>}
                  {prepaidOffer.prepaidDiscount > 0 && (
                    <li>₹{prepaidOffer.prepaidDiscount.toFixed(2)} prepaid offer</li>
                  )}
                  <li>Pay securely with UPI / cards</li>
                </ul>
                <p className="cod-confirm-newtotal">
                  New total: <strong>₹{prepaidOffer.onlineTotal.toFixed(2)}</strong>
                  <s>₹{prepaidOffer.codTotal.toFixed(2)}</s>
                </p>
              </div>
            </div>
          )}

          <div className="cod-confirm-actions">
            {prepaidOffer?.savings > 0 && (
              <button type="button" className="btn btn-primary btn-block" onClick={payOnlineInstead}>
                Switch to Prepaid &amp; save ₹{prepaidOffer.savings.toFixed(2)}
              </button>
            )}
            <button type="button" className="btn btn-outline btn-block" onClick={continueWithCod}>
              Continue with Cash on Delivery
            </button>
          </div>
        </div>
      </Modal>

      <CouponCelebration trigger={couponCelebrationTrigger} />
    </div>
  );
}

import { useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Loader2, Truck } from 'lucide-react';
import { deliveryService } from '../services/deliveryService';
import { useSettings } from '../context/SettingsContext';
import { estimateWindow } from '../utils/deliveryEstimate';
import { BrandDots } from './BrandLoader';
import './PincodeCheck.css';

/**
 * Self-contained "check delivery to your area" widget for the PDP — a
 * display-only convenience, separate from Checkout's own address form.
 * Reuses the exact same free postal-lookup API/pattern Checkout.jsx uses
 * (api.postalpincode.in) for the district/state display text, but the
 * deliverable/not-deliverable verdict itself comes from the backend
 * (deliveryService.checkPincode -> deliveryEligibilityService.js), which
 * independently re-resolves the pincode's state server-side rather than
 * trusting anything computed here. This still doesn't feed into cart/order
 * state at all — it's informational only; the real enforcement happens
 * again at checkout regardless of what this widget shows.
 */
export function PincodeCheck() {
  const { settings } = useSettings();
  const freeDeliveryThreshold = settings?.shipping?.freeThreshold ?? 0;
  const formatEstimate = () => estimateWindow(settings?.shipping);
  const codEnabled = settings?.cod?.enabled !== false;
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | found | not-deliverable | not-found
  const [area, setArea] = useState(null);

  function handleChange(e) {
    setPincode(e.target.value.replace(/\D/g, '').slice(0, 6));
    setState('idle');
    setArea(null);
  }

  async function handleCheck(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pincode)) return;
    setState('loading');
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();
      const office = data?.[0]?.PostOffice?.[0];
      if (data?.[0]?.Status !== 'Success' || !office) {
        setState('not-found');
        return;
      }
      setArea(`${office.District}, ${office.State}`);
      const { deliverable } = await deliveryService.checkPincode(pincode);
      setState(deliverable ? 'found' : 'not-deliverable');
    } catch {
      setState('not-found');
    }
  }

  return (
    <div className="pincode-check">
      <p className="pincode-check-title">
        <Truck size={16} /> Delivery Details
      </p>

      <p className="pincode-check-label">
        <MapPin size={14} /> Select delivery location
      </p>
      <form onSubmit={handleCheck} className="pincode-check-form">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Delivery pincode (6 digits)"
          placeholder="Enter pincode"
          value={pincode}
          onChange={handleChange}
          maxLength={6}
        />
        <button type="submit" className="btn btn-primary btn-sm pincode-check-btn" disabled={pincode.length !== 6 || state === 'loading'}>
          {state === 'loading' ? <Loader2 size={14} className="btn-spinner" /> : 'Check'}
        </button>
      </form>
      {state === 'loading' && (
        <p className="pincode-check-result pincode-check-loading">
          <BrandDots size="sm" /> Checking delivery…
        </p>
      )}

      {state === 'found' && (
        <>
          <p className="pincode-check-result success">
            <CheckCircle2 size={14} /> Delivers to {area}
          </p>
          <p className="pincode-check-result">
            <Truck size={14} /> Estimated delivery: {formatEstimate()}
          </p>
          <p className="pincode-check-result">
            {codEnabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{' '}
            {codEnabled ? 'Cash on Delivery available' : 'Cash on Delivery not available — pay online'}
          </p>
          {/* Only once a valid, deliverable pincode has been checked — a
              store-wide threshold (settings.shipping.freeThreshold). */}
          {freeDeliveryThreshold > 0 && (
            <p className="pincode-check-free-delivery">
              <CheckCircle2 size={14} /> Free delivery on orders above ₹{freeDeliveryThreshold}
            </p>
          )}
        </>
      )}
      {state === 'not-deliverable' && (
        <p className="pincode-check-result error">
          <XCircle size={14} /> Sorry, we don&apos;t currently deliver to {area}.
        </p>
      )}
      {state === 'not-found' && (
        <p className="pincode-check-result error">
          <XCircle size={14} /> Couldn&apos;t verify that pincode — please check and try again.
        </p>
      )}
    </div>
  );
}

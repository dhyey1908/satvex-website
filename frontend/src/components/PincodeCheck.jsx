import { useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import './PincodeCheck.css';

/**
 * Self-contained "check delivery to your area" widget for the PDP — a
 * display-only convenience, separate from Checkout's own address form.
 * Reuses the exact same free postal-lookup API/pattern Checkout.jsx uses
 * (api.postalpincode.in) rather than inventing new delivery/serviceability
 * rules; this only tells the shopper the pincode is valid and shows the
 * area name, it doesn't feed into cart/order state at all.
 */
export function PincodeCheck() {
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | found | not-found
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
      if (data?.[0]?.Status === 'Success' && office) {
        setArea(`${office.District}, ${office.State}`);
        setState('found');
      } else {
        setState('not-found');
      }
    } catch {
      setState('not-found');
    }
  }

  return (
    <div className="pincode-check">
      <p className="pincode-check-label">
        <MapPin size={14} /> Check delivery availability
      </p>
      <form onSubmit={handleCheck} className="pincode-check-form">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Enter pincode"
          value={pincode}
          onChange={handleChange}
          maxLength={6}
        />
        <button type="submit" className="btn btn-outline btn-sm" disabled={pincode.length !== 6 || state === 'loading'}>
          {state === 'loading' ? <Loader2 size={14} className="btn-spinner" /> : 'Check'}
        </button>
      </form>
      {state === 'found' && (
        <p className="pincode-check-result success">
          <CheckCircle2 size={14} /> Delivers to {area}
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

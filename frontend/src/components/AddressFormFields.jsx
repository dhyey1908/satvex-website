import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { LocationPicker } from './LocationPicker';
import { sanitizePhoneInput } from '../utils/validators';
import { useToast } from '../context/ToastContext';

const ADDRESS_TYPES = ['Home', 'Work', 'Other'];

// Shared field markup for the "add/edit address" experience — used by both
// Account > Addresses and Checkout's inline new-address form, so the two
// never drift into two different address forms with two different sets of
// validation/behavior. Callers own the actual form state/validation/submit;
// this only renders the fields and the map-pin affordance.
export function AddressFormFields({ form, setField, touched, markTouched, fieldErrors, pincodeLookupState }) {
  const [mapOpen, setMapOpen] = useState(false);
  const { showToast } = useToast();

  function handleMapConfirm(address) {
    setMapOpen(false);
    // Geocoding is never a substitute for real delivery serviceability —
    // the pincode here only drives the shipping-rate lookup elsewhere in
    // checkout, which is unaffected by this UI-only consistency check.
    if (address.pincode && form.pincode && address.pincode !== form.pincode) {
      showToast(
        `The map-selected location's pincode (${address.pincode}) differs from what you entered (${form.pincode}) — please double-check your address.`,
        'warning'
      );
    }
    if (address.line1) setField('houseFlat', address.line1);
    if (address.city) setField('city', address.city);
    if (address.state) setField('state', address.state);
    if (address.pincode) setField('pincode', address.pincode);
  }

  return (
    <>
      <div className="field">
        <label>Address Type</label>
        <div className="address-type-pills">
          {ADDRESS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`address-type-pill ${form.label === t ? 'selected' : ''}`}
              onClick={() => setField('label', t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-outline btn-sm address-map-btn" onClick={() => setMapOpen(true)}>
        <MapPin size={14} /> Pin Location on Map
      </button>

      <div className={`field ${touched.fullName && fieldErrors.fullName ? 'invalid' : ''}`}>
        <label htmlFor="address-fullName">Full Name</label>
        <input
          id="address-fullName"
          required
          value={form.fullName}
          onChange={(e) => setField('fullName', e.target.value)}
          onBlur={() => markTouched('fullName')}
        />
        {touched.fullName && fieldErrors.fullName && <p className="field-error">{fieldErrors.fullName}</p>}
      </div>
      <div className={`field ${touched.phone && fieldErrors.phone ? 'invalid' : ''}`}>
        <label htmlFor="address-phone">Mobile Number</label>
        <input
          id="address-phone"
          required
          inputMode="numeric"
          maxLength={10}
          value={form.phone}
          onChange={(e) => setField('phone', sanitizePhoneInput(e.target.value))}
          onBlur={() => markTouched('phone')}
        />
        {touched.phone && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
      </div>
      <div className={`field ${touched.pincode && fieldErrors.pincode ? 'invalid' : ''}`}>
        <label htmlFor="address-pincode">Pincode</label>
        <input
          id="address-pincode"
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
      <div className={`field ${touched.houseFlat && fieldErrors.houseFlat ? 'invalid' : ''}`}>
        <label htmlFor="address-houseFlat">House / Flat / Building</label>
        <input
          id="address-houseFlat"
          required
          value={form.houseFlat}
          onChange={(e) => setField('houseFlat', e.target.value)}
          onBlur={() => markTouched('houseFlat')}
        />
        {touched.houseFlat && fieldErrors.houseFlat && <p className="field-error">{fieldErrors.houseFlat}</p>}
      </div>
      <div className={`field ${touched.areaStreet && fieldErrors.areaStreet ? 'invalid' : ''}`}>
        <label htmlFor="address-areaStreet">Area / Street</label>
        <input
          id="address-areaStreet"
          required
          value={form.areaStreet}
          onChange={(e) => setField('areaStreet', e.target.value)}
          onBlur={() => markTouched('areaStreet')}
        />
        {touched.areaStreet && fieldErrors.areaStreet && <p className="field-error">{fieldErrors.areaStreet}</p>}
      </div>
      <div className="field">
        <label htmlFor="address-landmark">Landmark (optional)</label>
        <input id="address-landmark" value={form.landmark} onChange={(e) => setField('landmark', e.target.value)} />
      </div>
      <div className="field-row">
        <div className={`field ${touched.city && fieldErrors.city ? 'invalid' : ''}`}>
          <label htmlFor="address-city">City</label>
          <input
            id="address-city"
            required
            value={form.city}
            onChange={(e) => setField('city', e.target.value)}
            onBlur={() => markTouched('city')}
          />
          {touched.city && fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}
        </div>
        <div className={`field ${touched.state && fieldErrors.state ? 'invalid' : ''}`}>
          <label htmlFor="address-state">State</label>
          <input
            id="address-state"
            required
            value={form.state}
            onChange={(e) => setField('state', e.target.value)}
            onBlur={() => markTouched('state')}
          />
          {touched.state && fieldErrors.state && <p className="field-error">{fieldErrors.state}</p>}
        </div>
      </div>
      <div className={`field ${touched.country && fieldErrors.country ? 'invalid' : ''}`}>
        <label htmlFor="address-country">Country</label>
        <input
          id="address-country"
          required
          value={form.country}
          onChange={(e) => setField('country', e.target.value)}
          onBlur={() => markTouched('country')}
        />
        {touched.country && fieldErrors.country && <p className="field-error">{fieldErrors.country}</p>}
      </div>

      <LocationPicker open={mapOpen} onClose={() => setMapOpen(false)} onConfirm={handleMapConfirm} />
    </>
  );
}

export const ADDRESS_FORM_EMPTY = {
  label: 'Home',
  fullName: '',
  phone: '',
  houseFlat: '',
  areaStreet: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

export function addressFormToPayload(form) {
  return {
    label: form.label,
    fullName: form.fullName,
    phone: form.phone,
    line1: [form.houseFlat, form.areaStreet].filter(Boolean).join(', '),
    landmark: form.landmark,
    city: form.city,
    state: form.state,
    pincode: form.pincode,
    country: form.country,
  };
}

export function addressToForm(addr) {
  return {
    ...ADDRESS_FORM_EMPTY,
    ...addr,
    houseFlat: addr.line1 || '',
    areaStreet: '',
    landmark: addr.landmark || '',
  };
}

export function validateAddressForm(values, { required, minLength, phone: validatePhone, pincode: validatePincode }) {
  return {
    fullName: minLength(values.fullName, 2, 'Full name'),
    phone: validatePhone(values.phone, { optional: false }),
    houseFlat: required(values.houseFlat, 'House/Flat/Building'),
    // Optional, not required: reloading a saved address always sets this
    // to '' (its full address text can't be split back into houseFlat/
    // areaStreet), so requiring it here silently blocked every saved-
    // address checkout — the saved-address view doesn't even render this
    // field's error, so the "Continue" button looked broken with no
    // visible reason. line1 (which does include the full street text) is
    // still required via houseFlat above.
    areaStreet: '',
    city: minLength(values.city, 2, 'City'),
    state: minLength(values.state, 2, 'State'),
    pincode: validatePincode(values.pincode, { optional: false }),
    country: required(values.country, 'Country'),
  };
}

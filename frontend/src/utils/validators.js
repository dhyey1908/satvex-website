// Shared frontend field validators — mirror the backend's Zod rules
// (backend/src/validators/*.js) so a bad value is caught before the request
// ever goes out, not just after a round trip. Each function returns an
// error message string, or '' when the value is valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers start with 6-9. A number of one repeated digit
// (9999999999) is never real and is rejected by the courier.
const PHONE_RE = /^[6-9][0-9]{9}$/;
const REPEATED_DIGIT_RE = /^(\d)\1{9}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const PLACE_RE = /^[\p{L}\p{M}][\p{L}\p{M} .,'&()-]*$/u;
const PINCODE_RE = /^[0-9]{6}$/;
// Backend's address-book rule is looser (4-10 digits, not India-only 6) —
// used for the account address book, while Checkout keeps the stricter
// 6-digit India UX (input is also digit/length-filtered there).
const GENERIC_POSTAL_RE = /^[0-9]{4,10}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUPON_CODE_RE = /^[A-Z0-9]{3,20}$/;
const COLOR_HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function required(value, label = 'This field') {
  if (value === undefined || value === null) return `${label} is required.`;
  if (typeof value === 'string' && !value.trim()) return `${label} is required.`;
  if (Array.isArray(value) && value.length === 0) return `${label} is required.`;
  return '';
}

export function email(value, { optional = false } = {}) {
  const v = (value || '').trim();
  if (!v) return optional ? '' : 'Email is required.';
  return EMAIL_RE.test(v) ? '' : 'Enter a valid email address.';
}

export function phone(value, { optional = true } = {}) {
  const v = (value || '').trim();
  if (!v) return optional ? '' : 'Phone number is required.';
  if (!PHONE_RE.test(v)) return 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9).';
  if (REPEATED_DIGIT_RE.test(v)) return 'Please enter a real mobile number.';
  return '';
}

// Mirrors the server's rules (backend/src/validators/fieldRules.js) so a bad
// value is caught while typing instead of after "Place Order".
export function personName(value, label = 'Full name') {
  const v = (value || '').trim();
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (!NAME_RE.test(v) || (v.match(/\p{L}/gu) || []).length < 2) return `${label} can only contain letters, spaces and . ' -`;
  return '';
}

export function placeName(value, label = 'City') {
  const v = (value || '').trim();
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (!PLACE_RE.test(v)) return `${label} can only contain letters.`;
  return '';
}

export function indiaCountry(value) {
  const v = (value || '').trim();
  if (!v) return 'Country is required.';
  return /^india$/i.test(v) ? '' : 'We currently deliver only within India.';
}

// Strips anything that isn't a digit and caps at 10 chars — used as the
// onChange transform for every phone <input> so an invalid character or an
// 11th digit can never even be typed/pasted in, not just flagged on blur.
export function sanitizePhoneInput(value) {
  return (value || '').replace(/\D/g, '').slice(0, 10);
}

export function pincode(value, { optional = false } = {}) {
  const v = (value || '').trim();
  if (!v) return optional ? '' : 'Pincode is required.';
  return PINCODE_RE.test(v) ? '' : 'Enter a valid 6-digit pincode.';
}

export function postalCode(value, { optional = false } = {}) {
  const v = (value || '').trim();
  if (!v) return optional ? '' : 'Postal code is required.';
  return GENERIC_POSTAL_RE.test(v) ? '' : 'Enter a valid postal code (4–10 digits).';
}

export function minLength(value, min, label = 'This field') {
  const v = (value || '').trim();
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  return '';
}

export function maxLength(value, max, label = 'This field') {
  const v = (value || '').trim();
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}

export function password(value, { min = 8, max = 72 } = {}) {
  const v = value || '';
  if (!v) return 'Password is required.';
  if (v.length < min) return `Password must be at least ${min} characters.`;
  if (v.length > max) return `Password must be ${max} characters or fewer.`;
  return '';
}

export function passwordsMatch(value, other) {
  if (!value) return 'Please confirm your password.';
  return value === other ? '' : 'Passwords do not match.';
}

export function positiveNumber(value, label = 'This field') {
  if (value === '' || value === null || value === undefined) return `${label} is required.`;
  const n = Number(value);
  if (Number.isNaN(n)) return `${label} must be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  return '';
}

export function url(value, { optional = true } = {}) {
  const v = (value || '').trim();
  if (!v) return optional ? '' : 'This URL is required.';
  try {
    new URL(v);
    return '';
  } catch {
    return 'Enter a valid URL (starting with https://).';
  }
}

export function slug(value) {
  const v = (value || '').trim();
  if (!v) return 'Slug is required.';
  return SLUG_RE.test(v) ? '' : 'Slug must be lowercase letters, numbers and hyphens only (e.g. my-product).';
}

export function couponCode(value) {
  const v = (value || '').trim().toUpperCase();
  if (!v) return 'Coupon code is required.';
  return COUPON_CODE_RE.test(v) ? '' : 'Code must be 3–20 letters/numbers, no spaces or symbols.';
}

export function colorHex(value) {
  const v = (value || '').trim();
  if (!v) return 'Color is required.';
  return COLOR_HEX_RE.test(v) ? '' : 'Enter a valid hex color (e.g. #FF00AA).';
}

/**
 * Runs a { field: () => message } map of checks and returns only the
 * entries with a non-empty message, e.g. { email: 'Enter a valid...' }.
 * Checks are functions (not pre-computed values) so a check for a later
 * field can rely on an earlier field's already-known-valid value.
 */
export function runValidators(checks) {
  const errors = {};
  for (const [field, check] of Object.entries(checks)) {
    const message = check();
    if (message) errors[field] = message;
  }
  return errors;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}

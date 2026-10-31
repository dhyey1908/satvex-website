// The delivery-address text rules, as the customer sees them while typing. The server (backend/src/utils/addressRules.js)
// applies exactly these again to every request - this copy only exists so the problem shows up under the field
// instead of after "Place order". Keep the two in step.

export const MIN_ADDRESS = 10;
export const MAX_ADDRESS = 190;
export const MIN_LANDMARK = 3;
// The counter ("172 / 190") appears once the address is this long.
export const COUNTER_FROM = 160;

export const ENGLISH_MESSAGE = 'Please type this in English';
export const JUNK_MESSAGE = 'Please enter your full address (house/flat no., street, area).';
export const TOO_LONG_MESSAGE = `Address is too long. Please keep it under ${MAX_ADDRESS} characters.`;
export const TOO_SHORT_MESSAGE = `Please enter your full address (at least ${MIN_ADDRESS} characters).`;
export const LANDMARK_REQUIRED_MESSAGE = 'Please add a landmark so the delivery person can find you.';

// Letters A-Z a-z, digits, space and , . - / # ( ) & '
const ADDRESS_CHARS = /^[A-Za-z0-9 ,.\-/#()&']+$/;
// A name: letters, space and . ' - only
const NAME_CHARS = /^[A-Za-z .'-]+$/;
const JUNK_WORDS = new Set(['test', 'testing', 'asdf', 'qwerty', 'xyz', 'abc', 'na', 'n/a', 'none', 'null', 'dummy', 'sample', 'hello', 'hii']);

export const isEnglishAddressText = (text) => ADDRESS_CHARS.test(String(text || ''));
export const isEnglishName = (text) => NAME_CHARS.test(String(text || ''));

/** Only digits/symbols, the same character 4+ times in a row, or nothing but junk words ("test", "asdf", "na"...). */
export function isJunkText(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return false;
  if (!/[a-z]/.test(value)) return true;
  if (/(.)\1{3,}/.test(value)) return true;
  const letterWords = value.split(/[^a-z0-9/]+/).filter((w) => /[a-z]/.test(w));
  return letterWords.length > 0 && letterWords.every((w) => JUNK_WORDS.has(w));
}

/** The text that goes on the label: house/street, then the landmark. */
export function combinedAddress(line1, landmark) {
  const a = String(line1 || '').trim();
  const b = String(landmark || '').trim();
  return b ? `${a}, ${b}` : a;
}

/** house/flat + area/street the way checkout sends them as one line. */
export const joinStreet = (houseFlat, areaStreet) => [houseFlat, areaStreet].map((v) => String(v || '').trim()).filter(Boolean).join(', ');

/** First problem with the house/street + landmark pair as { field: 'line1' | 'landmark', message }, or null. */
export function addressTextProblem({ line1, landmark }, { requireLandmark = true } = {}) {
  const a = String(line1 || '').trim();
  const b = String(landmark || '').trim();
  if (!isEnglishAddressText(a)) return { field: 'line1', message: ENGLISH_MESSAGE };
  if (b && !isEnglishAddressText(b)) return { field: 'landmark', message: ENGLISH_MESSAGE };
  if (requireLandmark && b.length < MIN_LANDMARK) return { field: 'landmark', message: LANDMARK_REQUIRED_MESSAGE };
  if (isJunkText(a)) return { field: 'line1', message: JUNK_MESSAGE };
  if (b && isJunkText(b)) return { field: 'landmark', message: JUNK_MESSAGE };
  const length = combinedAddress(a, b).length;
  if (length > MAX_ADDRESS) return { field: 'line1', message: TOO_LONG_MESSAGE };
  if (length < MIN_ADDRESS) return { field: 'line1', message: TOO_SHORT_MESSAGE };
  return null;
}

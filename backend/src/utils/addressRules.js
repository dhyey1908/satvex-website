// Delivery-address text rules, enforced on the SERVER (checkout and the admin address editor both use them).
// The browser has the same rules in frontend/src/utils/addressRules.js so a customer sees the problem while
// typing, but the browser is never trusted: a request sent straight to the API goes through these.
//
// Why so strict: the address is printed on a courier label and read out to a delivery agent. Hindi or emoji text,
// "test" / "aaaa" and a city that does not belong to the pincode are the usual reasons a parcel comes back (RTO).

const MIN_ADDRESS = 10;
const MAX_ADDRESS = 190;
const MIN_LANDMARK = 3;

const ENGLISH_MESSAGE = 'Please type this in English';
const JUNK_MESSAGE = 'Please enter your full address (house/flat no., street, area).';
const TOO_LONG_MESSAGE = `Address is too long. Please keep it under ${MAX_ADDRESS} characters.`;
const TOO_SHORT_MESSAGE = `Please enter your full address (at least ${MIN_ADDRESS} characters).`;
const LANDMARK_REQUIRED_MESSAGE = 'Please add a landmark so the delivery person can find you.';

// Letters A-Z a-z, digits, space and , . - / # ( ) & '
const ADDRESS_CHARS = /^[A-Za-z0-9 ,.\-/#()&']+$/;
// A name: letters, space and . ' - only
const NAME_CHARS = /^[A-Za-z .'-]+$/;

// Words that are never a real address when they are all that was typed.
const JUNK_WORDS = new Set(['test', 'testing', 'asdf', 'qwerty', 'xyz', 'abc', 'na', 'n/a', 'none', 'null', 'dummy', 'sample', 'hello', 'hii']);

const isEnglishAddressText = (text) => ADDRESS_CHARS.test(String(text || ''));
const isEnglishName = (text) => NAME_CHARS.test(String(text || ''));

/** Text that is clearly not a real address: no letters, the same character 4+ times in a row, or only junk words. */
function isJunkText(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return false;
  if (!/[a-z]/.test(value)) return true; // only digits / symbols
  if (/(.)\1{3,}/.test(value)) return true; // aaaa, 1111, ....
  const words = value.split(/[^a-z0-9/]+/).filter(Boolean);
  const letterWords = words.filter((w) => /[a-z]/.test(w));
  return letterWords.length > 0 && letterWords.every((w) => JUNK_WORDS.has(w));
}

// The one line that goes on the label: house/street, then the landmark.
function combinedAddress(line1, landmark) {
  const a = String(line1 || '').trim();
  const b = String(landmark || '').trim();
  return b ? `${a}, ${b}` : a;
}

/**
 * Checks house/street + landmark. Returns the first problem as { field, code, message } (field is 'line1' or
 * 'landmark', code is stable for the browser) or null when the pair is fine.
 */
function addressTextProblem({ line1, landmark }, { requireLandmark = true } = {}) {
  const a = String(line1 || '').trim();
  const b = String(landmark || '').trim();

  if (!isEnglishAddressText(a)) return { field: 'line1', code: 'NOT_ENGLISH', message: ENGLISH_MESSAGE };
  if (b && !isEnglishAddressText(b)) return { field: 'landmark', code: 'NOT_ENGLISH', message: ENGLISH_MESSAGE };

  if (requireLandmark && b.length < MIN_LANDMARK) {
    return { field: 'landmark', code: 'LANDMARK_REQUIRED', message: LANDMARK_REQUIRED_MESSAGE };
  }
  if (isJunkText(a)) return { field: 'line1', code: 'JUNK_ADDRESS', message: JUNK_MESSAGE };
  if (b && isJunkText(b)) return { field: 'landmark', code: 'JUNK_ADDRESS', message: JUNK_MESSAGE };

  const length = combinedAddress(a, b).length;
  if (length > MAX_ADDRESS) return { field: 'line1', code: 'ADDRESS_TOO_LONG', message: TOO_LONG_MESSAGE };
  if (length < MIN_ADDRESS) return { field: 'line1', code: 'ADDRESS_TOO_SHORT', message: TOO_SHORT_MESSAGE };
  return null;
}

// --- city vs pincode ---------------------------------------------------------------------------------------------

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Edit distance where swapping two neighbouring letters costs 1 ("Surta" -> "Surat").
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[rows - 1][cols - 1];
}

/** Does the typed city closely match one of the places the pincode belongs to? (ignores case, spaces, punctuation, small typos) */
function cityMatchesPlaces(city, places) {
  const typed = squash(city);
  if (!typed) return false;
  return (places || []).some((place) => {
    const p = squash(place);
    if (!p || p === 'na') return false;
    if (p === typed) return true;
    // "Ahmedabad City" for district "Ahmedabad", "Mumbai" for "Mumbai Suburban"
    if (Math.min(p.length, typed.length) >= 4 && (p.includes(typed) || typed.includes(p))) return true;
    const allowed = p.length >= 8 ? 2 : p.length >= 4 ? 1 : 0;
    return editDistance(typed, p) <= allowed;
  });
}

module.exports = {
  MIN_ADDRESS,
  MAX_ADDRESS,
  MIN_LANDMARK,
  ENGLISH_MESSAGE,
  JUNK_MESSAGE,
  TOO_LONG_MESSAGE,
  LANDMARK_REQUIRED_MESSAGE,
  isEnglishAddressText,
  isEnglishName,
  isJunkText,
  combinedAddress,
  addressTextProblem,
  cityMatchesPlaces,
};

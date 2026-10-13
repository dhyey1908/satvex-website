// Shared Indian-mobile-number normalizer. A stored phone number can be a
// bare 10-digit string, or carry a +91/91 country-code prefix or leading
// trunk 0 (depending on how/when it was collected — e.g. older orders
// predating stricter checkout validation) — third-party APIs (PayU,
// Shiprocket) need the bare 10-digit form and silently misbehave
// (NaN/null, or a flat rejection) if handed anything else. Throws a clear,
// actionable message naming the field instead of letting a malformed
// number silently become NaN/null downstream, which previously surfaced
// to an admin as a raw, unexplained crash.
function normalizeIndianPhone(phone, fieldLabel = 'Phone number') {
  const digits = String(phone || '').replace(/\D/g, '');
  let normalized = digits;
  if (normalized.length === 12 && normalized.startsWith('91')) normalized = normalized.slice(2);
  else if (normalized.length === 11 && normalized.startsWith('0')) normalized = normalized.slice(1);
  if (normalized.length !== 10) {
    throw new Error(`${fieldLabel} is in an invalid format (expected a 10-digit Indian mobile number).`);
  }
  return normalized;
}

module.exports = { normalizeIndianPhone };

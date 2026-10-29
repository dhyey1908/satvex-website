// wa.me link for an Indian mobile number (stored as 10 digits, but tolerate +91 / spaces).
export function whatsappLink(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

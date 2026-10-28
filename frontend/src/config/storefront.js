// Storefront display config. Everything here is presentation-only (labels,
// flags, placeholder copy) — prices, stock, COD availability and social links
// come from the backend/settings, never from this file.

export const STOREFRONT = {
  // Which selling option carries the highlight badge ("Best Value" / "Most
  // Popular"). Set to null to show no badge.
  featuredOptionId: 'opt_combo3',
  featuredOptionLabel: 'Best Value',

  // Estimated delivery window shown only after a valid pincode is checked.
  // TODO(confirm): replace with your real dispatch + transit times.
  delivery: { dispatchDays: 2, transitDays: 5 },

  // The product name shown in the page heading (the stored name stays
  // "Butterfly", the design name).
  productTitleSuffix: 'Claw Clip',

  // Minimum selected-colour count hint wording is generated from the combo.

  // Checkout behaviour flags (presentation/flow only - prices and payments are
  // decided by the backend).
  checkout: {
    // REQUIRE_OTP_FOR_PREPAID: the mobile-OTP step is required for Cash on
    // Delivery orders; set true to require it for online (prepaid) orders too.
    requireOtpForPrepaid: false,
    // Coupon codes offered as one-tap chips. The backend still validates each
    // code when it is applied (an invalid/expired one just shows its error).
    couponChips: ['SATVEX10'],
  },

  // Accordions under "Product Details". All body copy is a placeholder.
  detailAccordions: [
    { id: 'size-material', title: 'Size & Material', body: 'TODO: add size (length x width), weight and material details for the claw clip.' },
    { id: 'how-to-use', title: 'How to Use & Care', body: 'TODO: add usage steps and care instructions (cleaning, storage).' },
    { id: 'shipping-returns', title: 'Shipping & Returns', body: 'TODO: summarise delivery time, shipping charges and the returns/refund policy. Full policy: Shipping & Delivery and Returns & Refunds pages.' },
  ],

  // FAQ accordion. All answers are placeholders.
  faqs: [
    { q: 'How many colours can I choose in a combo?', a: 'TODO: confirm — you pick as many colours as the combo includes (2 or 3) and may repeat a colour.' },
    { q: 'Is the claw clip suitable for thick hair?', a: 'TODO: add hair-type / grip guidance.' },
    { q: 'How long does delivery take?', a: 'TODO: add delivery timelines. Enter your pincode above for an estimate.' },
    { q: 'What if I want to return or exchange it?', a: 'TODO: summarise the return/exchange window and conditions.' },
  ],

  // Trust row under the buy buttons. `cod` is shown only if COD is enabled in
  // the store settings.
  trust: [
    { id: 'secure', icon: 'shield', label: 'Secure payment (UPI, Cards)' },
    { id: 'returns', icon: 'rotate', label: 'Easy returns' },
    { id: 'cod', icon: 'banknote', label: 'Cash on Delivery', requiresCod: true },
    { id: 'ships', icon: 'truck', label: 'Ships across India' },
  ],

  // Payment-method chips in the footer.
  paymentMethods: ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking'],
};

// Storefront display config. Everything here is presentation-only (labels,
// flags, placeholder copy) — prices, stock, COD availability and social links
// come from the backend/settings, never from this file.

export const STOREFRONT = {
  // Which selling option carries the highlight badge ("Best Value" / "Most
  // Popular"). Set to null to show no badge.
  featuredOptionId: 'opt_combo3',
  featuredOptionLabel: 'Best Value',

  // Estimated delivery window shown only after a valid pincode is checked.
  // Fallback only: the admin sets the real days in Settings > Checkout > Shipping.
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
  },

  // Who we are and the policy facts that more than one page states. Pages read these (never retype them), so the
  // policies, checkout, confirmation, footer and product page cannot contradict each other.
  business: {
    name: 'Satvex',
    address: 'Opp. Vaishnav Die Polishing, Nilkanth Industrial Area, Gopal Hotel Road, Nr. Maldhari Fatak, Gondal Chowkdi, Opp. Pixel Complex, Rajkot, Gujarat – 360004',
  },
  policy: {
    dispatch: '24–48 hours', // from the order being confirmed, every day of the week
    reportWithin: '48 hours', // damaged / wrong item must be reported within this long of delivery
    replyWithin: '1 business day',
  },

  // Trust row under the buy buttons. `cod` is shown only if COD is enabled in
  // the store settings.
  trust: [
    { id: 'secure', icon: 'shield', label: 'Secure payment (UPI, Cards)' },
    { id: 'returns', icon: 'rotate', label: 'Replacement or refund if damaged' },
    { id: 'cod', icon: 'banknote', label: 'Cash on Delivery', requiresCod: true },
    { id: 'ships', icon: 'truck', label: 'Ships across India' },
  ],

  // Payment-method chips in the footer.
  paymentMethods: ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net Banking'],
};

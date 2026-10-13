// Shared enquiry-type/reason/method labels for the admin Contacts list +
// detail pages — mirrors backend/src/validators/contactValidators.js's enum
// values. A missing/unknown enquiryType (pre-redesign legacy record) falls
// back to 'General Enquiry' everywhere these are used.

export const ENQUIRY_TYPE_LABELS = {
  order_tracking: 'Order Tracking',
  return_refund_exchange: 'Return / Refund / Exchange',
  payment_issue: 'Payment Issue',
  product_enquiry: 'Product Enquiry',
  cancel_order: 'Cancel Order',
  general_enquiry: 'General Enquiry',
};

export const ENQUIRY_TYPE_PILL_CLASS = {
  order_tracking: 'pill-inactive',
  return_refund_exchange: 'pill-warning',
  payment_issue: 'pill-danger',
  product_enquiry: 'pill-inactive',
  cancel_order: 'pill-warning',
  general_enquiry: 'pill-inactive',
};

export const RETURN_REASON_LABELS = {
  damaged: 'Damaged',
  defective: 'Defective',
  wrong_item: 'Wrong Item',
  missing_item: 'Missing Item',
  other: 'Other',
};

export const RETURN_RESOLUTION_LABELS = { refund: 'Refund', replacement: 'Replacement', exchange: 'Exchange' };

export const PAYMENT_METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', cod: 'COD', other: 'Other' };

export function enquiryTypeLabel(enquiryType) {
  return ENQUIRY_TYPE_LABELS[enquiryType] || 'General Enquiry';
}

export function enquiryTypePillClass(enquiryType) {
  return ENQUIRY_TYPE_PILL_CLASS[enquiryType] || 'pill-inactive';
}

export function isVideoUrl(url) {
  return /\.mp4(\?.*)?$/i.test(url || '');
}

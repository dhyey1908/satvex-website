// PayU's hosted checkout is a plain HTML form POST (not an SDK/session
// flow like Cashfree's) -- the backend returns { actionUrl, fields }
// (already hashed), and this just builds + submits that form, redirecting
// the whole browser to PayU's payment page.
//
// Two guards, because PayU throttles a merchant that posts the same payment
// repeatedly ("Too many Requests. Please try after 60 seconds"):
//  - the form is posted at most ONCE per page view (a double click, a second
//    caller or a re-render can never post it again), and
//  - the amount is re-checked here so a malformed one never reaches PayU.
// Nothing here retries: if PayU rejects the payment the customer returns to
// the order and chooses "Retry Payment", which gets a brand-new txnid.
let submitted = false;

// Coming back with the browser's Back button restores this page from its
// cache with `submitted` still true - the customer must be able to pay again.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    submitted = false;
  });
}

const AMOUNT_FORMAT = /^\d{1,9}\.\d{2}$/;

export async function redirectToPayuCheckout(payuParams) {
  const { actionUrl, fields } = payuParams || {};
  if (!actionUrl || !fields) throw new Error('Payment could not be started. Please try again.');

  const amount = String(fields.amount ?? '');
  if (!AMOUNT_FORMAT.test(amount) || Number(amount) <= 0) {
    throw new Error('The payment amount is invalid. Please refresh your cart and try again.');
  }
  if (!fields.txnid || !fields.hash) throw new Error('Payment could not be started. Please try again.');

  if (submitted) return; // already on its way to PayU
  submitted = true;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value ?? '';
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

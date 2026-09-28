import { load } from '@cashfreepayments/cashfree-js';

let cashfreePromise = null;

// Sandbox vs production is a Cashfree SDK setting, not something the app
// currently exposes via settings — VITE_CASHFREE_ENV lets it be switched at
// build time without a code change, matching the same sandbox-first rollout
// the backend follows.
function getMode() {
  return import.meta.env.VITE_CASHFREE_ENV === 'production' ? 'production' : 'sandbox';
}

function getCashfree() {
  if (!cashfreePromise) {
    cashfreePromise = load({ mode: getMode() });
  }
  return cashfreePromise;
}

// Hosted Checkout — redirects the whole browser to Cashfree's payment page.
// Nothing about card/UPI details is ever handled by this app.
export async function redirectToCashfreeCheckout(paymentSessionId) {
  const cashfree = await getCashfree();
  await cashfree.checkout({ paymentSessionId, redirectTarget: '_self' });
}

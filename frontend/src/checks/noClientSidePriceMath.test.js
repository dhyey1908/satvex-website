// Static guard, not a component test (the frontend has no React test runner
// configured — this needs none, since it only scans source text). Enforces
// "do not calculate any price in the browser; display only what the
// backend returns" for the Step 1 pricing display work:
//
//   1. OrderSummary.jsx and FreeShippingBanner.jsx — the two components
//      solely responsible for rendering totals/the free-shipping message —
//      must contain ZERO arithmetic on their own props. Every number shown
//      must be a direct prop read (prop.toFixed(2)), never prop + prop.
//   2. Every page that reads a live quote or a placed order must never
//      apply an arithmetic operator directly to one of the backend's own
//      price fields (quote.shipping, order.gstAmount, etc.) — that would
//      mean the page is computing a price itself instead of just showing
//      what the backend already computed.
//
// Run with: node --test src/checks/noClientSidePriceMath.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf-8');
}

// Matches e.g. "shipping +", "gstAmount -", "total*", "codCharge /" — a
// pricing-related identifier directly followed by an arithmetic operator.
// Does NOT match "−₹{shipping.toFixed(2)}" (no operator between the
// identifier and the next token there) or "shipping}" (display only).
// Operator must be surrounded by whitespace (the codebase's own style for
// real arithmetic, e.g. "productSavings + discountAmount") so this doesn't
// false-positive on a CSS class like "free-shipping-banner" or a comment's
// "amountToFreeShipping/qualifiesForFreeShipping".
const BARE_PRICE_FIELDS = ['subtotal', 'shipping', 'gstAmount', 'codCharge', 'discountAmount', 'prepaidDiscount', 'total', 'amountToFreeShipping'];
const bareArithmeticPattern = new RegExp(`\\b(${BARE_PRICE_FIELDS.join('|')})\\b\\s+[-+*/]\\s+`);

test('OrderSummary.jsx performs no arithmetic on its own props', () => {
  const src = read('components/OrderSummary.jsx');
  const offending = src.split('\n').filter((line) => bareArithmeticPattern.test(line));
  assert.deepEqual(offending, [], `Found arithmetic on a price prop in OrderSummary.jsx:\n${offending.join('\n')}`);
});

test('FreeShippingBanner.jsx performs no arithmetic on its own props', () => {
  const src = read('components/FreeShippingBanner.jsx');
  const offending = src.split('\n').filter((line) => bareArithmeticPattern.test(line));
  assert.deepEqual(offending, [], `Found arithmetic on a price prop in FreeShippingBanner.jsx:\n${offending.join('\n')}`);
});

// Matches e.g. "quote.shipping +", "order.total -" — a backend price field
// read via its dotted path, directly followed by an arithmetic operator.
// Scoped to the quote./order. prefix specifically so it never flags the
// pre-existing, unrelated "productSavings + discountAmount" (a display-only
// "you're saving" figure built from catalog data, not from quote/order
// price fields) or the quote-not-loaded-yet fallback
// "Number((total - discountAmount).toFixed(2))" (CartContext's raw `total`
// and the coupon's own `discountAmount`, used only before the real quote
// arrives — not a quote./order. field).
const dottedPriceFieldPattern = new RegExp(`\\b(quote|order)\\.(${BARE_PRICE_FIELDS.join('|')})\\b\\s+[-+*/]\\s+`);

test('Cart/Checkout/OrderConfirmation/AccountOrderDetail/AdminOrderDetail never do arithmetic on a quote./order. price field', () => {
  const files = [
    'pages/Cart.jsx',
    'pages/Checkout.jsx',
    'pages/OrderConfirmation.jsx',
    'pages/account/AccountOrderDetail.jsx',
    'pages/admin/AdminOrderDetail.jsx',
  ];
  for (const file of files) {
    const src = read(file);
    const offending = src.split('\n').filter((line) => dottedPriceFieldPattern.test(line));
    assert.deepEqual(offending, [], `Found arithmetic on a quote./order. price field in ${file}:\n${offending.join('\n')}`);
  }
});

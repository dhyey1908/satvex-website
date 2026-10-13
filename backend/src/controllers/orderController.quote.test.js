// The quote preview's prepaid-vs-COD comparison: only offered when online
// payment is usable, strictly best-effort, and never leaking internal
// courier/cost fields. Same monkey-patching pattern as the other
// controller tests — no mocking library.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const settingsService = require('../services/settingsService');
const orderController = require('./orderController');

const original = {
  cart: { ...cartService },
  pricing: { ...pricingService },
  settings: { ...settingsService },
};

after(() => {
  Object.assign(cartService, original.cart);
  Object.assign(pricingService, original.pricing);
  Object.assign(settingsService, original.settings);
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (p) => {
    res.body = p;
    return res;
  };
  return res;
}

let calls;
let onlineAvailable;
let failSecondCalc;

beforeEach(() => {
  calls = [];
  onlineAvailable = true;
  failSecondCalc = false;

  settingsService.getSettings = async () => ({ payments: { onlineEnabled: onlineAvailable, onlineTestUserIds: [] } });
  cartService.getCartForUser = async () => [
    { productId: 'p1', sellingOptionId: 'o1', selectedColors: ['c1'], quantity: 1, savedForLater: false },
  ];
  pricingService.resolveLineItem = async () => ({
    productId: 'p1',
    productName: 'Clip',
    unitPrice: 400,
    costPrice: 150, // internal — must never reach the browser
  });
  pricingService.calculateTotals = async ({ paymentMethod }) => {
    calls.push(paymentMethod);
    if (failSecondCalc && calls.length > 1) throw new Error('shiprocket down');
    const isCod = paymentMethod === 'COD';
    return {
      subtotal: 400,
      total: isCod ? 478.64 : 409.64,
      codCharge: isCod ? 59 : 0,
      prepaidDiscount: isCod ? 0 : 10,
      paymentMethod,
      quotedFreightCharge: 40, // internal — must be stripped
      quotedRtoCharge: 40,
    };
  };
});

async function quote(paymentMethod) {
  const res = fakeRes();
  await orderController.quote({ body: { paymentMethod }, user: { id: 'USER-1' } }, res);
  return res.body.data;
}

test('quote on COD includes the prepaid comparison with the real saving', async () => {
  const data = await quote('COD');
  assert.deepEqual(calls, ['COD', 'Online']);
  assert.equal(data.prepaidOffer.savings, 69);
  assert.equal(data.prepaidOffer.codCharge, 59);
  assert.equal(data.prepaidOffer.prepaidDiscount, 10);
  assert.equal(data.prepaidOffer.onlineTotal, 409.64);
  assert.equal(data.total, 478.64); // the selected method's own total is untouched
});

test('quote on Online compares against COD the other way round', async () => {
  const data = await quote('Online');
  assert.deepEqual(calls, ['Online', 'COD']);
  assert.equal(data.prepaidOffer.savings, 69);
  assert.equal(data.total, 409.64);
});

test('no prepaid offer when online payment is not available to the customer', async () => {
  onlineAvailable = false;
  const data = await quote('COD');
  assert.equal(data.prepaidOffer, null);
  assert.deepEqual(calls, ['COD']); // never even computed the alternative
});

test('a failing comparison never breaks the normal quote', async () => {
  failSecondCalc = true;
  const data = await quote('COD');
  assert.equal(data.prepaidOffer, null);
  assert.equal(data.total, 478.64);
});

test('internal cost fields are never in the quote response', async () => {
  const data = await quote('COD');
  assert.equal('quotedFreightCharge' in data, false);
  assert.equal('quotedRtoCharge' in data, false);
  assert.equal('costPrice' in data.items[0], false);
  assert.equal(JSON.stringify(data.prepaidOffer).includes('quoted'), false);
});

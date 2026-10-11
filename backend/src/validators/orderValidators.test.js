const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkoutSchema } = require('./orderValidators');

function baseCheckout(overrides = {}) {
  return {
    customer: { name: 'Jane Doe', phone: '9876543210', ...overrides.customer },
    address: {
      line1: '123 Test St',
      city: 'Rajkot',
      state: 'Gujarat',
      pincode: '360001',
      country: 'India',
    },
    paymentMethod: 'COD',
    ...overrides,
  };
}

test('checkoutSchema: COD does not require an email', () => {
  const result = checkoutSchema.parse(baseCheckout());
  assert.equal(result.customer.email, undefined);
});

// Confirmed against Cashfree's Create Order API reference: customer_details
// only requires customer_id + customer_phone, not customer_email.
test('checkoutSchema: Online does not require an email either', () => {
  const result = checkoutSchema.parse(baseCheckout({ paymentMethod: 'Online' }));
  assert.equal(result.customer.email, undefined);
});

test('checkoutSchema: Online succeeds when an email is given', () => {
  const result = checkoutSchema.parse(
    baseCheckout({ paymentMethod: 'Online', customer: { name: 'Jane Doe', phone: '9876543210', email: 'jane@example.com' } })
  );
  assert.equal(result.customer.email, 'jane@example.com');
});

test('checkoutSchema: phone is always required regardless of payment method', () => {
  assert.throws(() => checkoutSchema.parse(baseCheckout({ customer: { name: 'Jane Doe' } })));
});

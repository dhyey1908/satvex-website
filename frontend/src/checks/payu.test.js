// redirectToPayuCheckout posts the PayU form at most once and refuses a
// malformed amount. The checks run in Node, so a tiny DOM stub stands in.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
let forms;

// The module registers its `pageshow` listener when it is imported, so the
// window stub has to exist BEFORE the import below.
globalThis.window = { addEventListener: (type, fn) => (listeners[type] = fn) };

beforeEach(() => {
  forms = [];
  globalThis.document = {
    createElement: (tag) => {
      const el = { tag, children: [], style: {}, appendChild(c) { this.children.push(c); } };
      if (tag === 'form') el.submit = () => forms.push(el);
      return el;
    },
    body: { appendChild() {} },
  };
});

const { redirectToPayuCheckout } = await import('../utils/payu.js');

const good = () => ({
  actionUrl: 'https://secure.payu.in/_payment',
  fields: { key: 'k', txnid: 'abc123', amount: '24.78', productinfo: 'Order X', firstname: 'Jane', email: 'j@e.com', hash: 'h' },
});

test('posts the form once with every field, even if called repeatedly (double click / re-render)', async () => {
  await redirectToPayuCheckout(good());
  await redirectToPayuCheckout(good());
  await redirectToPayuCheckout(good());
  assert.equal(forms.length, 1);
  assert.equal(forms[0].action, 'https://secure.payu.in/_payment');
  assert.equal(forms[0].method, 'POST');
  assert.equal(forms[0].children.find((i) => i.name === 'amount').value, '24.78');
});

test('coming back from PayU (pageshow) allows paying again', async () => {
  listeners.pageshow();
  const before = forms.length;
  await redirectToPayuCheckout(good());
  assert.equal(forms.length, before + 1);
});

test('a malformed or zero amount never reaches PayU', async () => {
  listeners.pageshow();
  const before = forms.length;
  for (const amount of ['0.00', '', undefined, '24.7', '1,000.00', '₹24.78', '-5.00', 'NaN']) {
    const p = good();
    p.fields.amount = amount;
    await assert.rejects(() => redirectToPayuCheckout(p), /payment amount is invalid/i, `should reject ${String(amount)}`);
  }
  assert.equal(forms.length, before, 'no extra form was posted');
});

test('missing txnid/hash/params are refused rather than posted', async () => {
  listeners.pageshow();
  await assert.rejects(() => redirectToPayuCheckout(undefined), /could not be started/i);
  const p = good();
  delete p.fields.hash;
  await assert.rejects(() => redirectToPayuCheckout(p), /could not be started/i);
});

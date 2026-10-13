const test = require('node:test');
const assert = require('node:assert/strict');
const { stripProductCost, productForViewer, stripOrderCost } = require('./productVisibility');

const product = {
  productId: 'p1',
  sellingOptions: [
    { id: 'a', price: 499, costPrice: 200 },
    { id: 'b', price: 899, costPrice: null },
  ],
};

test('stripProductCost removes costPrice from every selling option and keeps the rest', () => {
  const out = stripProductCost(product);
  assert.deepEqual(out.sellingOptions, [
    { id: 'a', price: 499 },
    { id: 'b', price: 899 },
  ]);
  assert.equal(out.productId, 'p1');
  // original untouched
  assert.equal(product.sellingOptions[0].costPrice, 200);
});

test('productForViewer keeps the cost for admins only', () => {
  assert.equal(productForViewer(product, true).sellingOptions[0].costPrice, 200);
  assert.equal('costPrice' in productForViewer(product, false).sellingOptions[0], false);
});

test('stripOrderCost removes item costPrice and the quoted courier rates', () => {
  const order = {
    orderId: 'o1',
    total: 100,
    quotedFreightCharge: 40,
    quotedRtoCharge: 40,
    items: [{ productName: 'X', unitPrice: 50, costPrice: 20, quantity: 2 }],
  };
  const out = stripOrderCost(order);
  assert.equal('quotedFreightCharge' in out, false);
  assert.equal('quotedRtoCharge' in out, false);
  assert.equal('costPrice' in out.items[0], false);
  assert.equal(out.items[0].unitPrice, 50);
  assert.equal(out.total, 100);
});

test('helpers tolerate missing input', () => {
  assert.equal(stripOrderCost(null), null);
  assert.equal(stripProductCost(null), null);
  assert.deepEqual(stripOrderCost({ orderId: 'o' }).items, []);
});

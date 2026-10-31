// The bag API: every change answers with the WHOLE updated cart (so the browser can replace its copy and never
// end up half-updated), counts quantities the same way everywhere, makes "add" idempotent, and is never cached.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const cartService = require('../services/cartService');
const pricingService = require('../services/pricingService');
const cartController = require('./cartController');
const { noStore } = require('../middleware/noStore');
const { addCartItemSchema } = require('../validators/cartValidators');

const originals = [cartService, pricingService].map((m) => [m, { ...m }]);
const realSend = docClient.send.bind(docClient);
after(() => {
  originals.forEach(([m, o]) => Object.assign(m, o));
  docClient.send = realSend;
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (p) => ((res.body = p), res);
  return res;
}
const data = (res) => res.body.data || res.body;
const REQ_ID = '11111111-1111-4111-8111-111111111111';

let bag;
beforeEach(() => {
  bag = [
    { cartItemId: 'c1', productId: 'p1', quantity: 2, subtotal: 498, savedForLater: false, createdAt: '2026-10-31T01:00:00Z' },
    { cartItemId: 'c2', productId: 'p1', quantity: 1, subtotal: 349, savedForLater: false, createdAt: '2026-10-31T02:00:00Z' },
    { cartItemId: 'c3', productId: 'p2', quantity: 3, subtotal: 900, savedForLater: true, createdAt: '2026-10-31T03:00:00Z' },
  ];
  cartService.getCartForUser = async () => bag;
  cartService.getCartItem = async (u, id) => bag.find((i) => i.cartItemId === id) || null;
  cartService.addItem = async (u, line, quantity, requestId) => {
    const item = { cartItemId: requestId || 'new', productId: line.productId, quantity, subtotal: line.unitPrice * quantity, savedForLater: false, createdAt: '2026-10-31T04:00:00Z' };
    bag.push(item);
    return item;
  };
  cartService.removeItem = async (u, id) => { bag = bag.filter((i) => i.cartItemId !== id); };
  cartService.updateItem = async (u, id, line, quantity) => { const it = bag.find((i) => i.cartItemId === id); it.quantity = quantity ?? it.quantity; it.subtotal = 100 * it.quantity; return it; };
  cartService.setSavedForLater = async (u, id, saved) => { bag.find((i) => i.cartItemId === id).savedForLater = saved; };
  pricingService.resolveLineItem = async ({ productId }) => ({ productId, unitPrice: 349 });
});

const ctx = (over = {}) => ({ user: { id: 'U1' }, body: {}, params: {}, ...over });

test('GET /cart: items, saved items, total, and the count as the SUM of quantities (a combo counts as 1 per quantity)', async () => {
  const res = fakeRes();
  await cartController.getCart(ctx(), res);
  const d = data(res);
  assert.equal(d.items.length, 2);
  assert.equal(d.savedItems.length, 1);
  assert.equal(d.total, 847);
  assert.equal(d.itemCount, 3, '2 + 1 - saved-for-later items are not in the bag count');
  assert.equal(d.lineCount, 2);
});

test('add: answers with the FULL updated cart (not just the new line), so the browser can replace its copy', async () => {
  const res = fakeRes();
  await cartController.addToCart(ctx({ body: { productId: 'p1', sellingOptionId: 'o1', selectedColors: ['a'], quantity: 2, requestId: REQ_ID } }), res);
  assert.equal(res.statusCode, 201);
  const d = data(res);
  assert.equal(d.item.cartItemId, REQ_ID);
  assert.equal(d.items.length, 3);
  assert.equal(d.itemCount, 5, '3 + the 2 just added');
  assert.equal(d.total, 847 + 698);
});

test('update / remove / saved-for-later each answer with the full updated cart too', async () => {
  let res = fakeRes();
  await cartController.updateCartItem(ctx({ params: { id: 'c2' }, body: { quantity: 4 } }), res);
  assert.equal(data(res).itemCount, 6, '2 + 4');
  res = fakeRes();
  await cartController.removeCartItem(ctx({ params: { id: 'c1' } }), res);
  assert.deepEqual(data(res).items.map((i) => i.cartItemId), ['c2']);
  assert.equal(data(res).itemCount, 4);
  res = fakeRes();
  await cartController.updateSavedForLater(ctx({ params: { id: 'c2' }, body: { savedForLater: true } }), res);
  assert.equal(data(res).items.length, 0);
  assert.equal(data(res).savedItems.length, 2);
  assert.equal(data(res).itemCount, 0);
});

test('the add request accepts an optional UUID request id and rejects anything else', () => {
  const base = { productId: 'p', sellingOptionId: 'o', selectedColors: ['a'], quantity: 1 };
  assert.equal(addCartItemSchema.safeParse({ ...base, requestId: REQ_ID }).success, true);
  assert.equal(addCartItemSchema.safeParse(base).success, true);
  assert.equal(addCartItemSchema.safeParse({ ...base, requestId: 'not-a-uuid' }).success, false);
});

test('idempotent add: the same request id writes once; a repeat returns the existing line', async () => {
  Object.assign(cartService, originals[0][1]); // the real service, with a fake database underneath
  const stored = new Map();
  docClient.send = async (command) => {
    if (command instanceof PutCommand) {
      const { Item, ConditionExpression } = command.input;
      if (ConditionExpression && stored.has(Item.cartItemId)) throw Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' });
      stored.set(Item.cartItemId, Item);
      return {};
    }
    return { Item: stored.get(command.input.Key.cartItemId) };
  };
  const line = { productId: 'p1', productName: 'Clip', unitPrice: 349, selectedColors: ['a'] };
  const first = await cartService.addItem('U1', line, 1, REQ_ID);
  const second = await cartService.addItem('U1', line, 1, REQ_ID);
  assert.equal(stored.size, 1, 'written once');
  assert.equal(first.cartItemId, REQ_ID);
  assert.equal(second.cartItemId, REQ_ID, 'the repeat gets the same line back');
  const other = await cartService.addItem('U1', line, 1, '22222222-2222-4222-8222-222222222222');
  assert.equal(stored.size, 2, 'a different click is a different line');
  assert.notEqual(other.cartItemId, REQ_ID);
  docClient.send = realSend;
});

test('private responses are never cacheable', () => {
  const headers = {};
  let called = false;
  noStore({}, { set: (k, v) => { headers[k] = v; } }, () => { called = true; });
  assert.match(headers['Cache-Control'], /no-store/);
  assert.match(headers['Cache-Control'], /private/);
  assert.equal(headers.Pragma, 'no-cache');
  assert.equal(called, true);
});

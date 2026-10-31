const { signDirectCheckoutToken, verifyDirectCheckoutToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const pricingService = require('./pricingService');
const { lineSubtotal } = require('../utils/money');

// "Buy Now": a separate, one-item checkout. The session is a signed token (see utils/jwt) that holds only the
// selection - product, pack, colours, quantity - so the bag is never read or changed by it.

function createSession(userId, { productId, sellingOptionId, selectedColors, quantity }) {
  return signDirectCheckoutToken(userId, { productId, sellingOptionId, selectedColors: [...selectedColors], quantity });
}

// The item a Buy Now session holds. Refuses a token that is expired, edited, someone else's, or not a Buy Now one.
function readSession(token, userId) {
  let payload;
  try {
    payload = verifyDirectCheckoutToken(token);
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    throw new AppError(
      expired ? 'This Buy Now checkout has expired. Please choose the product again.' : 'This Buy Now checkout is not valid. Please choose the product again.',
      400,
      expired ? 'DIRECT_SESSION_EXPIRED' : 'DIRECT_SESSION_INVALID'
    );
  }
  if (payload.uid !== userId || !payload.item) {
    throw new AppError('This Buy Now checkout is not valid. Please choose the product again.', 400, 'DIRECT_SESSION_INVALID');
  }
  return payload.item;
}

// The session's ONE item, priced from the live product (never from anything stored in the token).
// Used wherever a Buy Now checkout needs its items instead of the bag: the quote, the order and the coupon check.
async function resolveItems(token, userId) {
  const chosen = readSession(token, userId);
  const lineItem = await pricingService.resolveLineItem({
    productId: chosen.productId,
    sellingOptionId: chosen.sellingOptionId,
    selectedColors: chosen.selectedColors,
  });
  return [{ ...lineItem, quantity: chosen.quantity, subtotal: lineSubtotal(lineItem.unitPrice, chosen.quantity) }];
}

module.exports = { createSession, readSession, resolveItems };

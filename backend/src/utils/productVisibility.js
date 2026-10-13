// Internal cost data that powers the admin Financial Analytics screen must
// never reach a customer's browser. Every endpoint that returns a product or
// an order to a non-admin caller passes it through here.

// The store's own cost of each pack (sellingOptions[].costPrice). The public
// product read endpoints are shared with the admin product screens, so the
// field is stripped unless the caller is an admin.
function stripProductCost(product) {
  if (!product || !Array.isArray(product.sellingOptions)) return product;
  return {
    ...product,
    sellingOptions: product.sellingOptions.map(({ costPrice, ...option }) => option),
  };
}

function productForViewer(product, isAdmin) {
  return isAdmin ? product : stripProductCost(product);
}

// An order carries the per-pack cost snapshotted on each item and the
// courier rates quoted at checkout (what the STORE pays) — admin-only.
function stripOrderCost(order) {
  if (!order) return order;
  const { quotedFreightCharge, quotedRtoCharge, ...rest } = order;
  return { ...rest, items: (order.items || []).map(({ costPrice, ...item }) => item) };
}

module.exports = { stripProductCost, productForViewer, stripOrderCost };

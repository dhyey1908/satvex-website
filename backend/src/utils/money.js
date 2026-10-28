// Money is calculated in integer paise and converted to rupees only at the edge,
// so no floating-point error (175.82000000000002) can reach a total, an order or
// the amount sent to PayU. Anything rounded is rounded exactly once.

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const fromPaise = (paise) => paise / 100; // integer / 100 -> the nearest 2-decimal double
// pct% of an amount in paise, rounded once to a whole paisa.
const percentOf = (paise, pct) => Math.round((paise * Number(pct)) / 100);
// price x quantity in rupees, computed in paise.
const lineSubtotal = (unitPrice, quantity) => fromPaise(toPaise(unitPrice) * Number(quantity));

module.exports = { toPaise, fromPaise, percentOf, lineSubtotal };

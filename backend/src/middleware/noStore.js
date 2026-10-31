// Private, per-customer API responses (the bag, orders, login state...) must never be stored by the browser,
// a service worker or a CDN: a stale copy is how a bag count ends up wrong until the page is refreshed.
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

module.exports = { noStore };

# SATVEX — Online Payment Gateway (PayU)

## Status
Cashfree was causing ongoing technical issues, so the online payment
gateway was replaced with **PayU** (https://payu.in/, docs at
https://docs.payu.in/). Checkout UI, order flow, cart, and DB structure are
unchanged — only the payment gateway integration itself was swapped. See
`18-payment-gateway.md` for the original (now superseded) Cashfree plan;
most of its surrounding decisions (coupon handling, expiry, refund policy,
needsReview, no-stock-system assumptions) carry over unchanged and aren't
repeated here — only what's different under PayU.

## Why PayU's integration shape is different
Cashfree used a session-based "create order via REST API, then redirect
via SDK" flow. PayU India's Hosted Checkout is a classic **hashed HTML
form POST** directly to PayU's payment page — there is no "create order"
network call to initiate a payment; the request hash itself is the
security mechanism, computed entirely server-side from values the backend
already has. This removes an entire class of "order created at PayU but
never written to our DB" rollback cases that existed for Cashfree.

## Key decisions
1. **`txnid` = our `orderId`**, for the order's entire lifetime including
   retries. PayU allows re-posting the same `txnid` as long as it never had
   a successful transaction, and the app's own
   `paymentStatus !== 'awaiting_payment'` guard already blocks a retry once
   paid — so no separate "latest txnid" field is needed.
2. **New DynamoDB attributes** `payuMihpayid` / `payuRefundId` (not a
   rename of `cfPaymentId` / `cfRefundId`) — purely additive, so historical
   Cashfree orders keep their old fields untouched; DynamoDB is schemaless,
   no migration needed.
3. **Never trust the frontend/redirect.** Both the callback and the
   status-poll endpoint call PayU's `verify_payment` API server-to-server
   before ever calling `markPaid` — a posted `status=success` field is
   never sufficient by itself (same principle as Cashfree's webhook
   confirmation, Decision 5 in the old doc).
4. **PRG (Post-Redirect-Get) callback**, not a webhook. PayU's `surl`/
   `furl` POST hits the *customer's browser*, so they must point at a
   backend URL (not the frontend directly, since an SPA can't easily
   consume a form POST on load). The backend processes it and responds
   with an HTTP 302 back to the frontend's existing
   `/order-confirmation/:id` page — which polls `getPaymentStatus` exactly
   as before. **Zero changes to `OrderConfirmation.jsx`'s polling logic.**
5. **Email fallback.** PayU's form requires a non-empty email, but the
   email field was removed from checkout UI entirely in an earlier change.
   The backend falls back to a placeholder (`customer@satvex.co.in`) when
   the customer has none on file. This is a known trade-off, not a real
   email — PayU doesn't contact customers from it, and no customer-facing
   email dispatch depends on it.
6. **Refund status is a real documentation gap.** PayU's `postservice.php`
   confirms a *refund request was accepted*, but no confirmed API exists
   in PayU's docs for later checking whether that refund actually
   succeeded — unlike Cashfree, which had `fetchRefundStatus`. A failed
   refund attempt is recorded as `failed` immediately rather than guessing
   at a polling mechanism; **a refund that PayU accepted but never
   completes must be reconciled manually in the PayU dashboard** — flagged
   here rather than silently assumed to resolve itself.

## Hash formulas (confirmed against docs.payu.in)
- **Request hash** (`buildRequestHash`):
  `sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)`
  — note the 5 empty fields between `udf5` and `SALT`.
- **Response/reverse hash** (`buildResponseHash`, used to verify the
  `surl`/`furl` POST actually came from PayU):
  `sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)`
  — 5 empty fields between `status` and `udf5`.
- **`verify_payment`**: `POST` to the post-service URL with `key`,
  `command=verify_payment`, `var1=<txnid>`,
  `hash=sha512(key|verify_payment|var1|SALT)`.
- **`cancel_refund_transaction`**: hash formula is **not explicitly
  documented** for this specific command — inferred from the general
  post-service pattern (`sha512(key|command|var1|salt)`), flagged with a
  `TODO(confirm)` comment in `payuService.js`. Re-verify against PayU
  support/docs before relying on refunds in production.

## Endpoints
| | Test | Production |
|---|---|---|
| Payment form action | `https://test.payu.in/_payment` | `https://secure.payu.in/_payment` |
| Post-service (verify/refund) | `https://test.payu.in/merchant/postservice.php?form=2` | `https://info.payu.in/merchant/postservice.php?form=2` |

Switched via `PAYU_ENV` (`test` default, or `production`).

## Backend
- `payuService.js` — hash building/verification, `verifyPayment(txnid)`,
  `initiateRefund({ mihpayid, refundId, amount })`. Pure local computation
  for building payment params (no network call); `verifyPayment` and
  `initiateRefund` are the only network calls to PayU.
- `orderController.checkout()` (Online path) — computes `payuParams`
  locally via `buildPaymentParams`, no rollback needed since nothing was
  committed externally; returns `{ order, payuParams }` instead of
  `{ order, paymentSessionId }`.
- `orderController.getPaymentStatus()` — single `verifyPayment` call
  replaces Cashfree's two-call (`fetchOrderStatus` + `fetchOrderPayments`)
  model. Checks our own `paymentExpiresAt` deadline first (PayU has no
  server-side order-expiry signal like Cashfree's `EXPIRED` status) and
  finalizes expiry directly if passed, without even calling PayU.
- `orderController.retryPayment()` — calls `verifyPayment` first (catches
  an already-succeeded payment), otherwise rebuilds fresh `payuParams`
  from `order.customer.*` with the same `txnid` (the order id).
- `orderController.adminRefund()` — requires `order.payuMihpayid`; records
  `status: 'pending'` on acceptance (refunds settle asynchronously — see
  the documentation gap above), `status: 'failed'` directly on rejection.
- `paymentController.callback()` (was `webhook()`) — `POST
  /api/payments/payu/callback`. Verifies the reverse hash, looks up the
  order, re-confirms via `verifyPayment`, updates state, and always
  responds with a 302 redirect to
  `{FRONTEND_ORIGIN}/order-confirmation/{txnid}` — never JSON.
- `expirePayments.js` — hourly sweep reconciles via `verifyPayment` before
  expiring; `success` → `markPaid` + trigger shipment (missed callback),
  `failure` → expire, `pending`/`not_found`/error → skip and retry next
  run. Never expires on an API error or inconclusive result.
- `app.js` — PayU's callback POSTs as `application/x-www-form-urlencoded`
  (standard HTML form submission), not JSON — `express.urlencoded()` was
  added. No raw-body capture is needed (unlike Cashfree's HMAC-over-raw-
  body): PayU's hash verification runs over individual posted fields.
- Callback base URL — `surl`/`furl` must point at the backend, unlike
  Cashfree where `return_url` pointed straight at the frontend. Built from
  the incoming request's own `req.protocol`/Host header
  (`resolveApiBaseUrl` in `orderController.js`), not baked into
  CloudFormation — referencing the HTTP API's id from inside this same
  Lambda's environment creates a circular dependency (the API needs the
  Lambda's ARN for its integration; the Lambda would need the API's id).
  `app.set('trust proxy', true)` in `app.js` makes `req.protocol` honor
  API Gateway's `X-Forwarded-Proto`. `API_BASE_URL` remains as a manual
  override, normally left blank.

## Frontend
- `utils/payu.js` (`redirectToPayuCheckout`) replaces `utils/cashfree.js` —
  builds a hidden HTML form from the backend's `{ actionUrl, fields }` and
  submits it, redirecting the browser to PayU's payment page. No SDK
  dependency (`@cashfreepayments/cashfree-js` removed from
  `package.json`).
- `Checkout.jsx`, `OrderConfirmation.jsx`, `AccountOrderDetail.jsx` — use
  `response.payuParams` / `retryPayment()`'s `payuParams` instead of
  `paymentSessionId`.
- `OrderConfirmation.jsx`'s actual polling logic is unchanged (same
  `getPaymentStatus` endpoint, same response shape for `paymentStatus`/
  `lastPaymentAttemptStatus`).

## Env vars
Replaces `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` / `CASHFREE_ENV` /
`CASHFREE_API_VERSION` with:
- `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT` — from the PayU dashboard
  (`NoEcho` params in `template.yaml`; move to Secrets Manager / SSM
  `SecureString` before live keys go in, same as the Cashfree plan always
  called for).
- `PAYU_ENV` — `test` (default) or `production`.
- `API_BASE_URL` — optional manual override, normally blank; see the
  callback base URL note above.

## Testing
- `payuService.test.js` — hash formulas against the documented exact
  strings, config-missing error, reverse-hash accept/reject/tamper
  detection, `verifyPayment` success/not-found/case-normalization,
  `initiateRefund` success/failure.
- `paymentController.test.js` — the PRG callback: invalid hash, success,
  failure, **a posted SUCCESS ignored when `verify_payment` disagrees**
  (the core "never trust the frontend" case), duplicate delivery, amount
  mismatch, unknown order, missing `txnid`.
- `orderController.paymentStatus.test.js` — `getPaymentStatus` across all
  `verify_payment` outcomes (success, success-with-amount-mismatch,
  failure, pending, not_found), the own-deadline-expiry short-circuit, the
  already-paid short-circuit (callback arrived first), a sequential
  pending→success poll, and `retryPayment`'s late-success and
  still-unpaid cases.
- Full backend (`npm test`, 104 tests) and frontend (`npm test` + `vite
  build`) suites pass after the migration.
- **Not yet done**: an actual end-to-end run against PayU's live test/
  sandbox environment, which requires real PayU test merchant key/salt —
  needs to happen before this branch is considered production-ready, per
  the standing rule that test credentials are obtained from the user, not
  guessed.

## Live-cutover checklist (same shape as the original Cashfree plan)
1. Obtain real PayU test merchant key/salt and exercise the full flow
   (success, failure, retry, refund) against `test.payu.in` before going
   further.
2. Move `PAYU_MERCHANT_KEY`/`PAYU_MERCHANT_SALT` to Secrets Manager/SSM
   `SecureString` before live keys go in.
3. Swap test keys for live keys, set `PAYU_ENV=production`.
4. Run one small real transaction end-to-end (payment → callback → `paid`).
5. Run one real refund end-to-end and manually confirm in the PayU
   dashboard that it actually completed (see the refund-status gap above —
   there is no API confirmation step to automate this check).
6. Only then enable Online Payments for real customers
   (`settings.payments.onlineEnabled`), same gating as before.

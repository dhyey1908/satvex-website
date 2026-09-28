# SATVEX — Online Payment Gateway (Cashfree)

## Status
v1 shipped COD-only. Checkout already has a "Cash on Delivery / Online
Payment" toggle and a settings-driven pricing engine
(`pricingService.calculateTotals`) that computes GST, shipping, and a
COD-only surcharge server-side — see `07-checkout-orders.md` and
`Admin → Settings` (Tax/Shipping/COD sections). None of that changes here.

Selecting "Online Payment" today has no real effect — the order is created
and confirmed exactly like COD, no payment is actually collected. This doc
plans closing that gap with **Cashfree Hosted Checkout** (UPI + Cards).

**⚠ This is a live issue right now, independent of when the rest of this
plan is built:** a real customer can select "Online Payment" today and get
an order placed with zero money collected, and there's already a backlog of
such orders sitting in the live Orders table. See Decision 7 and Rollout
Steps 0 / 0b.

## Decisions
*(confirmed 2026-09-28; revised 2026-09-29 round 1 and round 2 after
implementation review — reason noted on each revised item)*

1. **Checkout mode:** Cashfree **Hosted Checkout** (redirect), not Drop-in.
   Card/UPI details never touch our server. — unchanged.

2. **Coupon handling — revised 2026-09-29 (round 1).** The order stays
   `awaiting_payment` through any number of failed *payment attempts*
   (Cashfree's failure webhook is per-attempt, not per-order — a customer
   can fail on one card and immediately retry with UPI on the same order).
   The coupon is released only when the order itself reaches a terminal
   state. **As of round 2, the only automatic terminal state is `expired`**
   (24h timeout) — see Decision 6 (revised) for what happens if a payment
   then lands anyway, and #6 in the fixes below for why `failed` is not an
   automatically-reached state.

3. **Unpaid-order expiry:** `awaiting_payment` orders auto-expire after
   **24 hours**, releasing their coupon at that point. Expired orders stay
   visible in Admin for history — never deleted. The expiry job must
   reconcile with Cashfree before expiring anything, and must never expire
   an order on a Cashfree API error (see Expiry sweep below) — a paid order
   must never be expired.

4. **Refunds are in Phase 1.** Admin can refund an order only when
   `paymentMethod === 'Online' && paymentStatus === 'paid'`.
   **Revised 2026-09-29 (round 2): full-refund-only.** A single refund for
   the entire paid amount — no partial refunds in v1. This removes the need
   for "amount already refunded" accounting; a paid order can only ever be
   refunded once, successfully. Reason: a single `refundStatus` field can't
   correctly represent multiple partial refunds, and partial refunds aren't
   a real need for this store yet — simplest correct option.

5. **Payment safety:** webhook signature verified on the raw body, amount
   cross-checked against the order's own stored total, webhook handling is
   idempotent via conditional writes, and a `paid` order can never be
   downgraded back to `expired` by a later or out-of-order webhook.

6. **Payment confirmed after the order already expired — revised 2026-09-29
   (round 2).** Original round-1 default was auto-refund on re-validation
   failure. **Reason for revision:** there is no stock system in this app
   (confirmed by reading the code — see Inventory below), so the only thing
   left to "re-validate" is coupon eligibility, and the coupon was already
   released when the order expired. Auto-refunding a customer whose payment
   actually succeeded, without a human ever looking at it, is the wrong
   default for a low-volume store. **New default:** accept the late payment
   as `paid`, honor the order at the price the customer already paid (do
   **not** re-consume the coupon — see the lifecycle table's `expired →
   paid` row), and set `needsReview: true` with a `needsReviewReason` so an
   admin sees it and decides (nothing is auto-refunded). Surfaced in Admin
   Orders list and detail. **Confirmed 2026-09-29** — refunding a customer
   whose payment actually succeeded, over a coupon-eligibility check with
   no stock system behind it, is worse than an admin taking a look.

7. **Rollout safety.** Sandbox keys must never be reachable by real
   customers. **Revised 2026-09-29 (round 2): enforced on both ends, not
   just the frontend.** `settings.payments.onlineEnabled` (default `false`)
   gates whether the frontend renders the option **and** whether the
   backend accepts `paymentMethod: 'Online'` at all — the API must not
   trust the frontend to have hidden the button, since it can be called
   directly. An allowlist, `settings.payments.onlineTestUserIds`, lets
   specific accounts (e.g. your own) exercise the real Cashfree sandbox
   flow while the feature stays invisible to everyone else. See §3 in the
   fixes below for exactly how frontend and backend both honor it.

## Fixes from round-2 review

### 1. `expired → paid` — added to the lifecycle table
See table below. Coupon is **not** re-consumed (it was already released on
expiry); the order is honored at the price already paid; `needsReview` is
set. This is the concrete behavior behind the revised Decision 6.

### 2. Decision 6 — see above (flag-for-review, not auto-refund).

### 3. Backend must enforce `onlineEnabled`, not just hide the button
- `orderController.checkout()` rejects `paymentMethod: 'Online'` with a
  clear error (`400 ONLINE_PAYMENTS_DISABLED`) unless
  `settings.payments.onlineEnabled === true` **or**
  `req.user.id` is in `settings.payments.onlineTestUserIds`. This check
  happens before any Cashfree call or coupon commit.
- The frontend needs to know whether *this* user should see the option
  without the raw allowlist ever reaching the client (leaking who the test
  accounts are). The public `GET /settings` route gains
  `attachUserIfPresent` middleware and returns a derived boolean —
  `paymentsOnlineAvailable = onlineEnabled || (user && onlineTestUserIds
  includes user.id)` — computed server-side, never the raw list.
  `Checkout.jsx` renders the "Online Payment" radio only when that boolean
  is true.
- New test case (added to the matrix below): a direct API call with
  `paymentMethod: 'Online'` while the flag is off is rejected for a normal
  user and accepted for an allowlisted test user.

### 4. Auditing Online orders that already exist (Rollout Step 0b)
Orders placed with `paymentMethod: 'Online'` before this feature existed
have no `paymentStatus` field at all (it didn't exist yet). Two things:
- **Read rule** (applies everywhere an order is read, not just one place):
  a missing `paymentStatus` on a `paymentMethod: 'COD'` order is treated as
  `not_required` (matches today's behavior exactly, nothing changes for
  COD). A missing `paymentStatus` on a `paymentMethod: 'Online'` order is
  treated as **unpaid** and gets `needsReview: true` /
  `needsReviewReason: 'Pre-dates payment tracking'` the first time it's
  read after this feature ships — so it surfaces in Admin exactly like any
  other order needing a human decision, without a separate migration step.
- **Shipping gate correctness for this case**: the gate is
  `paymentMethod === 'Online' ? paymentStatus === 'paid' : true` — a
  legacy Online order with no `paymentStatus` fails that check exactly
  like any other unpaid Online order (correctly blocked), and a legacy COD
  order is never even evaluated against it (correctly unaffected). No
  special-casing needed beyond the read rule above.
- **One-off audit list**: before Step 0 ships, run a one-time query over
  the Orders table for `paymentMethod === 'Online'` (a Scan is fine for a
  single one-off admin task, unlike the recurring expiry sweep in §11)
  and hand the resulting list to admin for a per-order decision — contact
  the customer, convert to COD, or cancel. Not a permanent code path, just
  a one-time script run once at rollout time.

### 5. Checkout rollback — extended
If the DB order write (step 5) fails *after* the coupon was already
committed (step 4): roll back exactly the same way the existing
usage-limit-race rollback already does — remove the redemption record
(`couponRedemptionService.remove`) and decrement usage
(`couponService.decrementUsage`). The customer sees a normal "couldn't
place your order, please try again" error (same `AppError` pattern as
every other checkout failure) — the coupon is not consumed, so retrying
works cleanly. If a Cashfree order was already created in step 3, it's
still harmless and self-cleaning exactly as described there — it simply
expires on Cashfree's side with no money ever collected.

### 6. Is `failed` actually reachable? — No, not automatically. Removed from v1.
Verified against current Cashfree docs: order statuses are `ACTIVE`,
`PAID`, `EXPIRED`, `TERMINATED`, `TERMINATION_REQUESTED`
([Create Order reference](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create)).
`TERMINATED` is reached only via a **merchant-initiated** `PATCH
/orders/{order_id}` call with `order_status: TERMINATED`
([Terminate Order reference](https://docs.cashfree.com/reference/pgterminateorder))
— nothing in Cashfree's webhook events fires it automatically, and this
plan doesn't call that endpoint anywhere. **Resolution: `failed` is removed
from the automatic v1 lifecycle.** `expired` is the only automatic
order-level terminal state. The `failed` enum value is kept *reserved* in
the schema (unused in v1) in case a future "admin cancels a stuck pending
payment early" feature calls the terminate-order API deliberately — not
built now, not part of any current transition.

### 7. Timestamp freshness — dropped the strict cutoff
Cashfree retries webhooks after outages on their end, which can legitimately
arrive well after a short cutoff window — a strict age check would silently
drop real payment confirmations, which is worse than not having the check.
**Replaced with**: every webhook that reports a payment success is
confirmed via a direct server-to-server `fetchOrderStatus` call before we
ever write `paymentStatus: 'paid'` — that confirmation, plus signature
verification and idempotent conditional writes, is the actual safety net,
not a timestamp.

## Order lifecycle

### Fields on Order
- `paymentStatus`: `not_required` (COD) | `awaiting_payment` | `paid` |
  `expired` — (`failed` reserved, unused in v1, see fix #6)
- `lastPaymentAttemptStatus` — Cashfree's per-attempt status (`SUCCESS` |
  `FAILED` | `PENDING`), overwritten on every attempt; never drives
  `paymentStatus` by itself (Decision 2)
- `paymentAttemptCount`, `lastPaymentAttemptAt`
- `paymentExpiresAt` — `createdAt + 24h`, Online orders only
- `couponReleased` (boolean) — flipped `true` in the same conditional
  update that moves `paymentStatus` to `expired`, exactly once even under
  concurrent triggers
- `needsReview` (boolean), `needsReviewReason` (string) — new, round 2
- `cfPaymentId`, `paidAt`
- `refundStatus`: `none` | `pending` | `success` | `failed`
- `refundId` (ours, minted fresh on every attempt — see §9), `cfRefundId`,
  `refundAmount`, `refundRequestedAt`, `refundProcessedAt`,
  `refundedByAdminId`
- `refundAttempts[]` — new, round 2: `{ refundId, cfRefundId, status,
  requestedAt, processedAt }` per attempt, so a retry after a failed
  refund doesn't erase the history of the failed one. The top-level
  `refund*` fields always mirror the latest/current attempt.

Cashfree's own `order_id` is reused as our `orderId` — no separate id
needed to reconcile a webhook back to our Order record.

### Lifecycle table

| paymentStatus | Meaning | Enters from | Triggered by |
|---|---|---|---|
| `not_required` | COD order | — | checkout (COD) |
| `awaiting_payment` | Online order, not yet resolved; may have failed attempts | — | checkout (Online) |
| `paid` | Payment confirmed | `awaiting_payment` | webhook (confirmed via server-to-server `fetchOrderStatus`, not the webhook payload alone) |
| `paid` *(late)* | Payment confirmed after the order already expired | `expired` | webhook/reconcile — sets `needsReview: true`, does **not** re-consume the already-released coupon (Decision 6) |
| `expired` | 24h elapsed, no successful payment | `awaiting_payment` | expiry sweep, only after confirming Cashfree does **not** report `PAID` (fix #6 / §8) |

*(`failed` intentionally omitted — reserved but unreachable in v1, see fix #6.)*

| refundStatus | Meaning | Enters from | Triggered by |
|---|---|---|---|
| `none` | No refund requested | — | default |
| `pending` | Refund requested, written **before** calling Cashfree (idempotency guard) | `none`, `failed` (with a **new** `refundId` each time, see §9) | admin action |
| `success` | Cashfree confirmed the refund | `pending` | webhook (`REFUND_STATUS_WEBHOOK`) or admin-triggered status poll |
| `failed` | Cashfree rejected/failed the refund | `pending` | webhook or status poll; admin may retry, which mints a new `refundId` |

All transitions are conditional writes keyed on the current value (see
Concurrency) — never a plain read-then-write.

## Backend

### `paymentService.js` (Cashfree REST wrapper)
- `createOrder({ orderId, amount, customer, returnUrl, expiresAt })` —
  sends `order_expiry_time` set **10 minutes before** our own
  `paymentExpiresAt` (see §8), so Cashfree's side closes first and our
  sweep sees a definitive `EXPIRED` rather than racing an `ACTIVE` order.
- `fetchOrderStatus(orderId)`, `fetchOrderPayments(orderId)` — used by the
  payment-status poll fallback, the `paid` confirmation step, and the
  expiry sweep's reconciliation.
- `createRefund`, `fetchRefundStatus`.
- `verifyWebhookSignature` — **confirmed against current Cashfree docs**:
  Cashfree signs webhooks using the same `x-client-secret` used for API
  auth — there is no separate webhook-signing secret
  ([Payment Webhook Setup](https://www.cashfree.com/docs/payments/webhooks)).
  **`CASHFREE_WEBHOOK_SECRET` is removed from this plan** — signature
  verification uses `CASHFREE_SECRET_KEY`.

### Webhook validation (`POST /payments/cashfree/webhook`)
- Signature verified against `CASHFREE_SECRET_KEY`, on the raw body,
  route-scoped raw-body capture only.
- `order_id` in the payload must exist in our Orders table.
- `order_currency` must be `INR`.
- A reported payment success is **not** trusted from the webhook payload
  alone — always confirmed via `fetchOrderStatus`/`fetchOrderPayments`
  before writing `paymentStatus: 'paid'` (fix #7 — this replaces timestamp
  freshness as the anti-replay mechanism).
- Non-success statuses (`PENDING`, `FAILED`) update
  `lastPaymentAttemptStatus`/`paymentAttemptCount` only, per Decision 2.
- Return `200` quickly for every *verified* event, including ones
  intentionally ignored (e.g. `PENDING`) — Cashfree retries on non-2xx.
  Return `4xx` only when the signature itself doesn't verify.
- Raw body capture is scoped to the webhook route only, not the global
  `express.json()`. Needs empirical verification once deployed that the
  bytes reaching the signature check are byte-identical to what Cashfree
  signed — this stack runs on Lambda behind API Gateway via
  `serverless-http`, where body encoding (base64 or not) depends on
  content-type handling. Framed correctly per fix #7: if a signature
  mismatch ever happens because of an encoding issue, the server-to-server
  `fetchOrderStatus` fallback (below) still picks the payment up on the
  next poll or sweep — a signature mismatch **delays** a payment, it
  doesn't **lose** one.

### Webhook-loss fallback
- `GET /orders/:id/payment-status`: if still `awaiting_payment` when
  polled, calls `paymentService.fetchOrderStatus` server-to-server and
  reconciles before responding — never trusts client-side redirect params.
- The expiry sweep reconciles with Cashfree before expiring anything —
  see §8.

### Concurrency and correctness
- Every `paymentStatus`/`refundStatus` transition is a DynamoDB
  `UpdateCommand` with a `ConditionExpression` on the current value —
  never a plain read-then-write.
- **Checkout order of operations (Online path)**:
  1. Resolve cart items + compute totals.
  2. Mint `orderId`.
  3. Reject up front if Online payments aren't enabled for this user
     (fix #3).
  4. Call Cashfree `createOrder` — before touching the coupon or writing
     to our DB. Failure here needs no rollback (nothing committed yet);
     customer sees "try again, or use Cash on Delivery."
  5. Commit the coupon (redemption record + `incrementUsage`) — same
     existing rollback-on-failure as COD. If this fails after step 4
     succeeded, the resulting orphaned Cashfree order self-expires with no
     money collected (harmless, no cleanup code needed).
  6. Write the DB order. **If this fails after step 5 succeeded**, roll
     back the coupon commit the same way (fix #5) — customer sees a normal
     retry-able error, coupon isn't burned.
  7. Clear the cart.
  8. Return `{ order, paymentSessionId }`.
  COD path unchanged (skips steps 3–4).

### Inventory — no stock system exists (unchanged from round 1)
Confirmed by reading `pricingService.js` / `productService.js`: no
quantity-based inventory, no reservation, no decrement-on-order logic
anywhere. Nothing to release on `expired`; no oversell-by-count risk.

### Fulfilment gating
- `AdminOrderDetail`'s status dropdown blocks advancing an Online order to
  `Shipped`/`Delivered` unless `paymentStatus === 'paid'` — enforced in the
  backend validator, not just hidden in the UI.
- **New, round 2: cancelling a paid Online order.** Setting `status:
  'Cancelled'` on an order with `paymentMethod === 'Online' &&
  paymentStatus === 'paid'` is blocked by the backend unless
  `refundStatus` is already `pending` or `success` — i.e. admin must at
  least *initiate* a refund before the order can be cancelled, so a
  cancelled order can never silently keep the customer's money.  (Cancel
  is still allowed while a refund is in-flight/`pending`, not only after
  it fully succeeds — otherwise a slow refund would block cancellation
  entirely for no reason.)
- Legacy Online orders with no `paymentStatus` are handled by the read
  rule in fix #4 — they read as unpaid and are blocked from shipping
  exactly like any other unpaid Online order, no special-casing needed.

### Refunds — details added (round 2)
- Full-refund-only (Decision 4) — no `alreadyRefunded` accounting;
  validation is just `refundAmount === order.total` (using the order's own
  paid total) and `refundStatus` not already `success`.
- Idempotent by construction: mint `refundId`, write `refundStatus:
  'pending'` (`ConditionExpression` on current status being `none` or
  `failed`) **before** calling Cashfree. A double-click or retried request
  both hit the same condition; the second one no-ops.
- **A retry after a `failed` refund mints a brand-new `refundId`** —
  Cashfree refund ids must be unique per order, an old failed one can't be
  reused. The previous attempt is preserved in `refundAttempts[]`.
- **If `createRefund` itself throws after `refundStatus: 'pending'` was
  already written** (e.g. network error mid-call — did Cashfree receive it
  or not?): do not blindly retry with a new call. Resolve by calling
  `fetchRefundStatus(orderId, thatSameRefundId)` to find out what actually
  happened, and update state from that — retrying blind risks a duplicate
  refund on Cashfree's side even though our own idempotency guard is solid.
- `refundedByAdminId` stored from `req.user.id`.

### Expiry sweep — query and safety (round 2, §8/§11)
- Cashfree's `order_expiry_time` is set 10 minutes **before** our own
  `paymentExpiresAt`, so by the time our sweep looks at a candidate order,
  Cashfree has very likely already closed it — the sweep should see a
  definitive `EXPIRED`, not a race against `ACTIVE`.
- The sweep **must never expire an order on a Cashfree API error** —  if
  the status call errors, or still returns `ACTIVE`, skip that order this
  run and retry on the next hourly pass. Only ever expire on an explicit,
  confirmed non-`PAID` result.
- **Query, not Scan**: replace the naive full-table scan with a new GSI —
  `paymentStatus-paymentExpiresAt-index` (`HASH: paymentStatus, RANGE:
  paymentExpiresAt`) on the Orders table — so the sweep queries only
  `awaiting_payment` orders past their deadline instead of scanning
  everything. `template.yaml` change: add this GSI to `OrdersTable`.
- Cap batch size per run (e.g. 25–50 orders) and space out the Cashfree
  status calls within a run to stay well under their rate limits, rather
  than firing all of them concurrently.

### Phone normalization (round 2, precise rule)
Cashfree's `customer_phone` needs a plain 10-digit Indian mobile number.
Our existing checkout validator allows spaces/parens/`+`. Normalize as:
1. Strip everything except digits.
2. If the result is 12 digits and starts with `91`, drop the leading `91`.
3. If the result is 11 digits and starts with `0`, drop the leading `0`.
4. If what remains isn't exactly 10 digits, **reject with a clear checkout
   error** ("Enter a valid 10-digit mobile number for online payment")
   rather than sending something malformed to Cashfree.

### Other endpoints (unchanged from round 1)
- `POST /orders/:id/retry-payment` — requireAuth + ownership check.
- `POST /admin/orders/:id/refund` — admin-only, guarded per Decision 4.
- Scheduled Lambda (EventBridge, hourly) running the reconcile-then-expire
  sweep.
- `app.js`: raw-body capture scoped to the webhook route only.
- Env vars (`NoEcho` params, `template.yaml` + `samconfig.toml`):
  `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`,
  `CASHFREE_API_VERSION`. *(`CASHFREE_WEBHOOK_SECRET` removed — see fix
  above.)* Move to Secrets Manager / SSM `SecureString` before live keys go
  in — see the live-cutover checklist.
- Amounts always go through the existing `Number(x.toFixed(2))` pattern.
- Cashfree validation errors on `createOrder` surfaced as a normal
  `AppError`, not a 500.

## Frontend
- `@cashfreepayments/cashfree-js` — Hosted Checkout redirect on Online
  submit.
- `OrderConfirmation.jsx`: polls `GET /orders/:id/payment-status` with
  backoff. On poll timeout, shows "We're still confirming your payment —
  please don't pay again" rather than an immediate retry button, to avoid
  double-payment. Retry only appears once the order is confirmed
  `expired` (or legacy-unpaid per fix #4).
- Duplicate-success edge case (two successful payments landing on one
  order): not auto-resolved client-side — routes to the same admin refund
  path.
- Checkout.jsx: "Online Payment" renders only when the server-computed
  `paymentsOnlineAvailable` flag (fix #3) is true — never a raw settings
  field, never decided purely client-side.
- Admin Orders/Order Detail: `paymentStatus`, `lastPaymentAttemptStatus`,
  and `needsReview` badges; refund action + status + `refundAttempts`
  history; shipping-status gating; cancel-requires-refund gating.

## Security checklist
- Signature verified against `CASHFREE_SECRET_KEY` on the raw body,
  webhook-route-scoped capture only.
- `order_id` existence and currency validated.
- A reported success is always confirmed server-to-server before being
  trusted — this, not a timestamp cutoff, is the anti-replay mechanism
  (fix #7).
- Amount cross-checked against the order's own stored total.
- Idempotent by construction via conditional writes.
- `paid` → `expired` downgrade is impossible (only `awaiting_payment` →
  terminal transitions exist; nothing transitions away from `paid`).
- Card/UPI data never passes through our backend — Hosted Checkout only.
- `retry-payment` / `payment-status` require ownership checks.
- Refund idempotency via pre-write `pending` status + fresh `refundId` per
  attempt + `fetchRefundStatus` reconciliation on ambiguous failures.
- Backend rejects `paymentMethod: 'Online'` outright when not enabled for
  the requesting user (fix #3) — the frontend hiding the button is not a
  security boundary by itself.

## Testing matrix
Sandbox UPI success, sandbox card success, single-attempt failure followed
by a successful retry on the same order (coupon stays committed, order
stays `awaiting_payment` throughout), fully abandoned payment, 24-hour
auto-expiry with reconciliation (+ coupon released exactly once), **late
payment confirmed after expiry → `paid` with `needsReview: true`, coupon
not re-consumed**, duplicate webhook delivery, out-of-order/lost webhooks
reconciled via the fallback poll, tampered webhook amount, expiry sweep
skipping an order on a Cashfree API error or `ACTIVE` response (never
expiring on error), concurrent refund double-clicks, refund retry after
failure using a fresh `refundId` with history preserved, `createRefund`
throwing after `pending` was written and resolving via `fetchRefundStatus`,
cancelling a paid Online order prompting/requiring a refund first, raw-body
signature verification through the real API Gateway/Lambda path, access
control (user A cannot poll/retry-pay/see user B's order), **direct API
call with `paymentMethod: 'Online'` while `onlineEnabled` is false is
rejected; an allowlisted test user succeeds anyway**, **legacy pre-feature
orders with no `paymentStatus` are read and gated correctly (COD unaffected,
Online treated as unpaid + `needsReview`)**, a delayed webhook arriving
after a Cashfree-side outage is accepted rather than dropped as stale,
phone numbers with `+91`/`91`/leading-`0` normalizing correctly, and
confirming "Online Payment" is invisible to real customers while running
on sandbox keys. Webhooks require a public HTTPS URL — test against the
deployed dev API Gateway, not localhost.

## Rollout
**Step 0:** hide/disable "Online Payment" immediately behind
`settings.payments.onlineEnabled` (default `false`), enforced on both
frontend and backend (fix #3) — can ship ahead of the rest of this plan.

**Step 0b:** run the one-off audit query for pre-existing
`paymentMethod: 'Online'` orders (fix #4) and resolve each manually
(contact customer / convert to COD / cancel) before or shortly after
Step 0 ships.

Then build and test entirely against Cashfree **sandbox** keys on the
existing dev stack, using `onlineTestUserIds` to exercise the real flow
without exposing it publicly. COD, GST, shipping, and discount logic are
untouched throughout.

**Live-cutover checklist:**
1. Register the production webhook URL in the Cashfree live dashboard.
2. Move `CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY` to Secrets Manager or SSM
   `SecureString` — plain `NoEcho` env vars are fine for sandbox testing
   but should not carry live keys.
3. Swap sandbox keys for live keys.
4. Run one small real transaction end-to-end (payment → webhook → `paid`).
5. Run one real refund end-to-end on that transaction.
6. Only then set `settings.payments.onlineEnabled = true` (or expand the
   allowlist gradually before going fully public).

## Open questions
1. **Raw body integrity through API Gateway → Lambda → serverless-http** —
   still an empirical test once deployed, not something resolvable from
   docs alone. Low-stakes now that a signature mismatch only delays (via
   the reconcile fallback) rather than loses a payment.
2. **Cancel-requires-refund edge case** — is "refund at least initiated
   (`pending`)" the right bar for allowing cancellation, or should
   cancellation be blocked until the refund fully *succeeds*? Current plan
   uses the lighter bar (`pending` or `success`) so a slow refund doesn't
   block cancellation indefinitely — flag if you'd rather require full
   success.

*(Resolved: webhook signing secret — confirmed `x-client-secret`, no
separate secret exists; whether `failed` is reachable — confirmed not
automatically, removed from v1's active lifecycle; Decision 6 — confirmed
2026-09-29, accept-and-flag-for-review, no auto-refund.)*

## Ready to build?
Still blocking real implementation:
- [ ] Your input on Open Question 2 (cancel/refund bar), or accept the
      current default (lighter bar: `pending` or `success`).
- [ ] A Cashfree account with sandbox `APP_ID`/`SECRET_KEY` — needed before
      any end-to-end testing (not before writing the code itself).

Not blocking, can start once the above land:
- Everything in Backend/Frontend/Fixes above is fully specified and
  consistent, including Decision 6 — no known open contradictions remain.

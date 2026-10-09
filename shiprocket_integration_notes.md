# Shiprocket web integration: notes (verified against real working code)

Source: Shiprocket's official open-source MCP server, `github.com/bfrs/shiprocket-mcp`
(read 2026-10-09, commit at time of reading), cross-checked against Shiprocket's own
API docs page (apidocs.shiprocket.in) and support article
(support.shiprocket.in/support/solutions/articles/43000337456). Unlike the GoKwik
notes, these ARE backed by real, tested, production TypeScript source — not a page
summary — so treat field names/paths here as reliable. Still verify response shapes
empirically against our own sandbox account before going live, since Shiprocket's
own docs page couldn't be rendered for us directly (JS-rendered SPA).

## Base URLs
- `https://apiv2.shiprocket.in` — all `/v1/external/...` endpoints
- `https://serviceability.shiprocket.in` — serviceability/rate check only

## Setup
- Shiprocket panel → Settings → API → Add New API User. Email must differ from the
  main account login. This is the "API user" whose email/password you log in with —
  never the regular panel login.

## Auth
`POST {base}/v1/external/auth/login`
Body: `{ "email": "...", "password": "..." }`
Response: `{ "token": "<jwt>" }` — field is literally `token`, no nesting.
Use as `Authorization: Bearer <token>` on every subsequent call.
Token validity: Shiprocket's own support article says 240 hours (10 days); cache and
refresh proactively (don't wait for a 401) and also refresh reactively on 401.

## List pickup addresses
`GET /v1/external/settings/company/pickup?medium=satvex`
Response: `data.shipping_address[]`, each: `{ id, pickup_location, address, city, state, country, pin_code }`

## Serviceability / shipping rates
`GET {serviceability base}/courier/ratingserviceability?pickup_postcode=X&delivery_postcode=Y&weight=Z&cod=0|1`
(`cod=1` for COD orders, `0` for prepaid; `weight` in kg)
Response: `data.available_courier_companies[]`, each:
`{ courier_name, cutoff_time, etd, freight_charge, is_surface (bool — true=SURFACE, false=AIR), rto_charges }`

## Create order
`POST /v1/external/orders/create/adhoc`
Body (confirmed working shape):
```json
{
  "order_id": "<our own unique order id/string>",
  "order_date": "YYYY-MM-DD",
  "pickup_location": "<pickup_location nickname, must already exist in Shiprocket>",
  "billing_customer_name": "<first name>",
  "billing_last_name": "<last name, '' if none>",
  "billing_address": "...",
  "billing_city": "...",
  "billing_pincode": 400001,
  "billing_state": "...",
  "billing_country": "India",
  "billing_email": "...",
  "billing_phone": 9876543210,
  "shipping_is_billing": true,
  "order_items": [{ "name": "...", "sku": "...", "units": 1, "selling_price": 236 }],
  "payment_method": "COD" | "Prepaid",
  "sub_total": 236,
  "length": 10, "breadth": 10, "height": 10, "weight": 0.5
}
```
Response: `data.order_id` (Shiprocket's own order id — truthy on success; `data.message`
carries the error on failure). TODO(confirm): the response almost certainly also
returns `shipment_id` (order_list shows shipments on an order), but the MCP tool
itself never reads it out — confirm the exact field name empirically against our
sandbox before relying on it (needed to assign AWB/generate label).

## Assign AWB ("ship" the order)
`POST /v1/external/courier/assign/awb`
Body: `{ "oid": <Shiprocket order id, number or numeric string>, "courier_id": <optional number> }`
Response: `response.data.courier_name`, `response.data.awb_code` — note the double
nesting (`data.response.data...`), confirmed from real code.

## Schedule pickup
`POST /v1/external/courier/generate/pickup`
Body: `{ "oid": <Shiprocket order id>, "pickup_date": ["YYYY-MM-DD"] }` — pickup_date is
an ARRAY even for one date.

## Generate label
`POST /v1/external/courier/generate/label`
Body: `{ "shipment_id": <number> }`
Response: `data.label_created` (bool), `data.label_url` (PDF URL).

## Cancel order
`POST /v1/external/orders/cancel`
Body: `{ "ids": [<Shiprocket order id>], "cancel_on_channel": true|false }`

## Track by AWB
`GET /v1/external/courier/track/awb/{awb}`
Response: `data.tracking_data.shipment_track[0].current_status`,
`data.tracking_data.shipment_track_activities[]` (each: `activity`, `location`, `date`),
`data.tracking_data.track_url`.

## List orders (for reconciliation)
`GET /v1/external/orders?filter=<comma-separated status ids>&filter_by=status`
Status-id groups the MCP server uses (TODO(confirm) — these aren't officially
published as far as we found, just what this real integration uses):
- NEW: `1`
- CANCELLED: `5,18`
- READY_TO_SHIP: `34,14,35,12,13,3,4`
- IN_TRANSIT: `37,20,44,19,51,43,6`
- DELIVERED: `7`
- RTO: `15,55,46,45,16,17,36,87,85`

## Tracking webhook (real sample body, from Shiprocket's own docs page)
Setup: Shiprocket panel → Settings → API → Webhooks → add callback URL, enable
toggle, optionally set a security token. Method: always `POST`, `Content-Type:
application/json`. If a security token is set, it arrives as header `x-api-key`.
Avoid the words shiprocket/kartrocket/sr/kr in the webhook URL path (their own
instruction — presumably to avoid some internal filter). Must respond 200.

```json
{
  "awb": "19041424751540",
  "courier_name": "Delhivery Surface",
  "current_status": "IN TRANSIT",
  "current_status_id": 20,
  "shipment_status": "IN TRANSIT",
  "shipment_status_id": 18,
  "current_timestamp": "23 05 2023 11:43:52",
  "order_id": "1373900_150876814",
  "sr_order_id": 348456385,
  "awb_assigned_date": "2023-05-19 11:59:16",
  "pickup_scheduled_date": "2023-05-19 11:59:17",
  "etd": "2023-05-23 15:40:19",
  "scans": [ { "date": "...", "status": "X-UCI", "activity": "...", "location": "...", "sr-status": "5", "sr-status-label": "MANIFEST GENERATED" } ],
  "is_return": 0,
  "channel_id": 3422553,
  "pod_status": "OTP Based Delivery",
  "pod": "Not Available",
  "qc_image": "",
  "qc_failure_reason": ""
}
```
NDR/RTO are presumably reported via `current_status`/`shipment_status` string values
on this same webhook (e.g. "RTO"), not a separate webhook — TODO(confirm) the exact
status strings used for NDR specifically (not shown in this one sample).

## Response/error codes (from Shiprocket's docs page directly)
`200`/`202` success · `400` bad request · `401` unauthorized (bad/expired token) ·
`404` not found · `405` wrong method · `422` unprocessable · `429` rate limited ·
`500`/`502`/`503`/`504` server error.

## Open questions (genuinely unconfirmed — don't guess these)
1. Exact `shipment_id` field name/location in the order/create response (needed
   immediately after creating an order, to assign AWB and generate the label).
2. Exact NDR status string(s) on the tracking webhook, and whether RTO-delivered is
   a distinct status or the same webhook with `current_status: "RTO"` then later a
   "DELIVERED" variant.
3. Return-order creation endpoint (not covered by the MCP server's tool set at all —
   it only covers forward shipments). Needs separate research once needed.
4. Manifest generation/print endpoints (`/v1/external/manifests/generate`,
   `/v1/external/manifests/print`) — confirmed to exist from the support article's
   step list, but no real request/response example found yet (not in the MCP
   server's tool set either).
5. Rate limit numbers for `429` (not specified anywhere found).

# SATVEX — Checkout and Orders

## Payment
v1 shipped COD-only, no gateway. v2 added a real PayU Hosted Checkout
integration (UPI + Cards) behind the existing "Cash on Delivery / Online
Payment" checkout toggle — see `20-payu-migration.md` (supersedes the
original Cashfree plan in `18-payment-gateway.md`). COD remains fully
supported and unaffected either way.

## Checkout
Authenticated users can access checkout.

Collect:
- Name
- Phone
- Email
- Address
- City
- State
- Pincode
- Country

## Order Summary
Display:
- Product
- Selling option
- Selected colors
- Quantity
- Unit price
- Subtotal
- Coupon discount (if applied)
- Shipping: free (v1 uses free shipping; no shipping cost logic/config needed yet)
- Total

## Backend Validation
Never trust:
- Product price
- Combo price
- Product availability
- User identity
- Coupon discount amount (re-validate the code and recompute the discount server-side)

Re-read required product/selling-option information on the backend before creating an order.

## Order
Suggested fields:
- id
- userId
- items[]
- customer details
- address (or addressId, if a saved address was selected)
- subtotal
- couponCode / discount (if applied)
- shipping
- total
- status
- createdAt
- updatedAt

## Order Status
Use:
- Pending
- Confirmed
- Processing
- Shipped
- Delivered
- Cancelled

## Customer
Customer can:
- Place order
- See confirmation
- View order history
- View order details
- Cancel order (only while status is Pending/Confirmed)
- Reorder (re-adds the order's items to the cart, re-validated through the existing pricing/availability checks, never trusting the stored order price)
- Track order (this is just the existing `status` field shown on a visual timeline — not real carrier tracking)

## Saved Addresses
A per-user address book: new `satvex_addresses` table (PK `userId`, SK `addressId`), CRUD via account settings, one marked default, selectable at checkout instead of re-typing the address each time. Checkout without a saved address still works exactly as it does today (single one-off address) — the saved-address picker is additive, not a replacement for the existing form.

## Coupons
A new `satvex_coupons` table (code, discount type/amount, active, expiry, usage limit), admin CRUD, and a checkout-time validate+apply step — the discount is recalculated and verified server-side when the order is created, same "never trust the client" rule as product pricing. Applied discount is stored on the order record for historical accuracy.

## Admin
Admin can:
- View orders
- Search orders
- Filter orders
- View order details
- Update order status

No quantity-based inventory/stock management. The v2 UI's "In Stock"/"Out of Stock" display is just the existing `isActive` boolean on variants/selling options, not a stock-count system.

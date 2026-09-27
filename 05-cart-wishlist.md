# SATVEX — Cart and Wishlist

## Cart Login Requirement
A user must be authenticated to add an item to the server-side cart.

If unauthenticated user clicks Add to Cart:
- Show login/signup prompt
- Preserve the intended action when practical
- After successful login, allow continuation

## Cart Item
Store:
- productId
- product name snapshot where appropriate
- sellingOptionId
- selectedColors[]
- quantity
- unitPrice
- subtotal

Example:
Butterfly
Combo of 2
Pink + Blue
Qty 1
Price ₹1499

## Cart Features
- View cart
- Increase quantity
- Decrease quantity
- Remove item
- Edit combo
- Edit selected colors
- Recalculate subtotal
- Show total
- Continue shopping
- Checkout

Never trust price calculations from the browser.
Backend must validate product, selling option and price.

## Wishlist
Wishlist requires login.

Features:
- Add product
- Remove product
- View wishlist
- Move to cart
- Product image
- Product price
- Active/inactive product handling

## Wishlist Behavior
Prevent duplicate wishlist entries.

## Empty States
Cart:
"Your cart is empty."

Wishlist:
"Your wishlist is empty. Discover something beautiful from SATVEX."

## Security
All cart and wishlist operations must be scoped to the authenticated user.
A user must never access another user's cart or wishlist.

# SATVEX — DynamoDB Specification

## Goal
Use DynamoDB with minimum operational complexity and cost.

Decision: separate tables per entity (not single-table design). Cost is identical under PAY_PER_REQUEST billing, and separate tables are materially easier to reason about and query for this app's small entity count.

Logical entities:
- Users
- Products
- Orders
- Cart
- Wishlist
- Contacts
- Settings (site-wide config: contact phone/email, Instagram URL — required by the admin panel's Settings section; a single-item table, negligible cost)
- Addresses (per-user saved address book — v2 UI/UX overhaul, see `02-ui-ux-design.md`)
- Coupons (discount codes — v2 UI/UX overhaul)

## Table Names
- satvex_users
- satvex_products
- satvex_orders
- satvex_carts
- satvex_wishlists
- satvex_contacts
- satvex_settings
- satvex_addresses
- satvex_coupons

All tables use PAY_PER_REQUEST billing (DynamoDB has no fixed per-table cost under this billing mode, so adding a table only for settings has no meaningful cost impact).

## Access Patterns / Indexes
- satvex_users: PK = userId. GSI `email-index` (PK = email) for login lookup — the one genuinely-needed index.
- satvex_products: PK = productId. Catalog stays small by design, so slug lookup and listing use a Scan rather than a GSI.
- satvex_carts: PK = userId, SK = cartItemId.
- satvex_wishlists: PK = userId, SK = productId (this also structurally prevents duplicate wishlist entries via a conditional write).
- satvex_orders: PK = orderId. GSI `userId-createdAt-index` (PK = userId, SK = createdAt) for "my orders". Admin listing/filtering uses a Scan (order volume expected to stay modest for this store).
- satvex_contacts: PK = contactId.
- satvex_settings: PK = settingsId, single fixed item.
- satvex_addresses: PK = userId, SK = addressId.
- satvex_coupons: PK = code (the coupon code itself is the natural unique key — a customer/admin lookup is always by code, so this avoids a GSI).

## Product Data
Store:
- product identity
- descriptions
- price/configuration
- variant definitions
- selling options
- active/featured state
- S3 object keys
- timestamps

Do not store image binary data in DynamoDB.

## User Data
Store only required application information:
- userId
- name
- email
- phone if required
- passwordHash (bcrypt, never plaintext)
- role (customer/admin)
- resetTokenHash + resetTokenExpiry (for forgot-password flow, cleared after use)
- createdAt
- updatedAt

## Cart
Partition by user ID or equivalent access pattern.

## Wishlist
Partition by user ID.

Prevent duplicate product wishlist entries.

## Orders
Support access patterns:
- user's orders
- order by ID
- admin order listing/filtering

Use GSIs only when a real query requires them.

## Addresses
Fields: userId, addressId, label (e.g. "Home"), fullName, phone, line1, city, state, pincode, country, isDefault, createdAt, updatedAt. Only one address per user may have `isDefault = true` (enforced in the service layer, not via a DB constraint).

## Coupons
Fields: code (PK), discountType (`percentage` | `flat`), discountValue, isActive, expiresAt, usageLimit, usageCount, createdAt, updatedAt. Checkout re-reads the coupon by code, checks `isActive`/`expiresAt`/`usageLimit` server-side, and recomputes the discount — the client never supplies a discount amount directly.

## Data Rules
- Use ISO timestamps or consistent epoch format
- Use stable IDs
- Avoid unnecessary duplicated data
- Validate data before writing
- Keep product snapshots in orders where necessary for historical accuracy

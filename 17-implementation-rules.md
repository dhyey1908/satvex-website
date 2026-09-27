# SATVEX — Claude Implementation Rules

## UI/UX v2 Overhaul (current effort)

`02-ui-ux-design.md` was rewritten (v2) for a full UI/UX overhaul of the shipped site. Its "Scope Decisions Needed Before Implementation" table must be resolved before Phase 3 below starts, since a few items there (coupons, saved addresses, review counts) add real backend scope beyond pure layout work. Process for this effort specifically:

1. Update markdown plan (`02-ui-ux-design.md`, `03-frontend.md`, and this file) — done.
2. Resolve the open scope decisions with the user.
3. Review existing frontend (components/pages/routing/API integration already in place — reuse, don't rewrite working code).
4. Rebuild UI/UX in priority order: global layout → navbar → product grid/card → shop → product detail → wishlist → cart → account → orders → checkout → order confirmation → search → contact → about → footer → mobile responsive.
5. Test all flows (see Testing below, plus wishlist/cart/checkout/orders/search/contact/admin specifically).
6. Responsive QA at 1440 / 1280 / 1024 / 768 / 430 / 390 / 375.

## First Step
Before coding:
1. Inspect the existing repository.
2. Identify existing frontend/backend.
3. Identify existing AWS configuration.
4. Identify reusable code.
5. Identify existing product data.
6. Identify existing authentication.
7. Identify what already works.
8. Create an implementation plan.
9. Then implement.

Do not unnecessarily rewrite working code.

## Source of Truth
Use these files as modular requirements:
- project overview
- UI/UX
- frontend
- product system
- cart/wishlist
- authentication
- checkout/orders
- admin
- backend
- DynamoDB
- S3
- AWS architecture
- security
- SEO/performance
- seed data
- deployment

If requirements conflict, prefer:
1. Security
2. Product/data correctness
3. Core user flow
4. Minimum-cost architecture
5. UI/UX requirements

## Implementation Order
Recommended:
1. Project structure
2. UI design system
3. Authentication
4. Product/data model
5. Backend/API
6. DynamoDB
7. S3 media
8. Product listing/detail
9. Cart
10. Wishlist
11. Checkout
12. Orders
13. Admin
14. Contact/About
15. SEO/performance
16. Testing
17. Deployment

## Do Not Overbuild
Do not add:
- payment gateway
- inventory management
- warehouse
- supplier system
- shipping provider
- loyalty program
- ERP
- microservices
- EC2/RDS/Redis

unless explicitly requested later.

## Code Quality
- Reusable components
- Clear naming
- Small focused functions
- Validation
- Error handling
- No duplicated business logic
- No hardcoded secrets
- No hardcoded product configuration

## UI Quality
Do not accept a basic generated-looking UI.
Review:
- desktop
- tablet
- mobile
- loading
- empty
- error
- success states

## Testing
At minimum test:
- public browsing
- login/signup
- protected routes
- product loading
- single color selection
- combo selection
- duplicate color validation
- cart
- wishlist
- checkout
- order creation
- admin authorization
- product CRUD
- order status update

## Final Verification
Before declaring completion:
- no major console errors
- no broken API calls
- no unauthorized admin access
- no cross-user cart/wishlist access
- no client-trusted pricing
- responsive layout works
- README is updated
- .env.example exists
- deployment instructions work

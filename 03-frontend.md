# SATVEX — Frontend Specification

## Stack
Use React.js with a maintainable component architecture.

Do not introduce Redux unless complexity actually requires it.

**As of the v3 Premium Motion & Icon overhaul (see `02-ui-ux-design.md`):** two additional
dependencies are approved and in use —
- **`framer-motion`** for real animation (spring transitions, orchestrated/staggered
  reveals, crossfades, scroll-triggered reveals, drawer/modal motion). Prefer
  `transform`/`opacity`-only animations for performance; respect
  `prefers-reduced-motion` everywhere (see the Motion System section of
  `02-ui-ux-design.md`).
- **`lucide-react`** replaces the hand-rolled `components/Icons.jsx` SVG set. Import only
  the specific icons used per file (tree-shakeable) — never `import * as icons`.

No other UI/animation/icon libraries should be added without the same explicit
sign-off process.

## Suggested Structure
frontend/
  src/
    components/
    pages/
    layouts/
    hooks/
    services/
    context/
    utils/
    assets/
    routes/

## Suggested Domains
- auth
- products
- cart
- wishlist
- checkout
- orders
- admin

## Routing
Public:
- /
- /shop
- /product/:slug
- /about
- /contact
- /login
- /signup

Authenticated — shopping flow (unchanged):
- /wishlist
- /cart
- /checkout
- /order-confirmation/:id

Authenticated — account (new structure, replaces the old bare `/profile`):
- /account (Account Overview dashboard)
- /account/orders (was `/orders`)
- /account/orders/:id (was `/orders/:id`)
- /account/addresses (new — see `02-ui-ux-design.md` Scope Decisions)
- /account/profile
- /account/change-password

Old `/profile`, `/orders`, `/orders/:id` should redirect to their `/account/*` equivalents rather than being removed outright, so no existing link breaks.

Admin:
- /admin
- /admin/products
- /admin/products/new
- /admin/products/:id
- /admin/orders
- /admin/orders/:id
- /admin/customers

## State
Use simple state management:
- React Context for auth/cart/wishlist when appropriate
- Local component state
- API/server state through clean service hooks

## API Layer
Keep API calls centralized.
Do not scatter fetch/axios calls throughout UI components.

## Components

Existing (keep, extend in place — do not duplicate):
- Header, Footer, BrandLogo
- ProductCard, ProductGallery, ColorSwatch, SellingOptionSelector, ComboColorSelector
- CartItem, WishlistItem
- Modal, Toast, Loader/Skeleton, EmptyState, ErrorState, ImagePlaceholder, Icons
- ProtectedRoute, AdminRoute

New, for the v2 UI/UX overhaul (`02-ui-ux-design.md`):
- ProductGrid — the shared responsive grid wrapper used by Home/Shop/Wishlist/Search (3–4 / 2–3 / 2 columns)
- Drawer — generic slide-in panel (mobile filters, mobile search, wishlist variant-picker all reuse this one component)
- SearchOverlay — desktop search dropdown/overlay
- PageHeader — shared page title + eyebrow + result-count pattern (Shop, Orders, Wishlist)
- AccountSidebar — desktop account navigation
- OrderCard, OrderStatusBadge, OrderTimeline
- AddressCard, AddressSelector (depends on the address-book scope decision)
- OrderSummary — extracted from the duplicated Cart/Checkout summary markup
- QuantitySelector, RatingDisplay, PriceDisplay
- CouponInput (only if that scope decision is confirmed)

## Frontend Rules
- No hardcoded product colors
- No hardcoded product prices
- No hardcoded admin data
- No AWS credentials
- No business logic duplicated across pages
- Use environment variables for API configuration

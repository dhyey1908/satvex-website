# SATVEX — UI/UX Design Requirements

**Status: v2 — complete UI/UX overhaul.** Supersedes the v1 version of this file. Written to fix production issues in the shipped v1 UI: excessive empty space, poor use of desktop width, undersized product grids, and several pages (Account, Orders, Checkout, Wishlist, Cart, Search, Contact, About) that read as prototypes rather than a finished premium ecommerce site.

Implementation order for this overhaul: see `17-implementation-rules.md`.

## Scope Decisions — Resolved

These extended beyond pure UI/UX into new backend scope; resolved before Phase 3 (rebuild):

| Item | Decision |
|---|---|
| **Stock status** | No quantity-based inventory. "In Stock"/"Out of Stock" maps directly to the existing `variant.isActive` / `sellingOption.isActive` fields. |
| **SKU** | Derived (not hardcoded) from existing stable IDs, e.g. `SATVEX-{productId short}-{variantId short}`. No new field. |
| **Reviews** | Rating stays a static decorative value. Review **count** becomes a real admin-configurable `reviewCount` field on the product (not hardcoded, not a full review/submission system). |
| **Coupons** | **Build it.** New `satvex_coupons` table, admin CRUD, checkout-time server-side validate + apply (never trust a client-computed discount). |
| **Saved addresses** | **Build it.** New `satvex_addresses` table (PK `userId`, SK `addressId`), CRUD via account settings, one default, selectable at checkout. |
| **Order tracking** | "Track Order" = the existing real `order.status` shown on a visual timeline. Not real carrier tracking. |
| **Cancel order (customer)** | New customer-scoped cancel action, allowed only while status is `Pending`/`Confirmed`. |
| **Reorder** | Re-adds order items to cart, re-validated through the existing `pricingService` — never trusts the stored order price. |
| **Save for later** (cart) | New `savedForLater: boolean` on cart items. |
| **Compare-at price / sale badge** | New `compareAtPrice` field on product/selling-option records. Sale badge = `compareAtPrice > price`. |
| **Body typeface** | **Switch to Plus Jakarta Sans** (deliberate change from the currently-live Inter). |

Everything below assumes the real, minimal version of each item above — never faking data on the frontend, consistent with `13-security.md` / `17-implementation-rules.md`'s "no client-trusted pricing, no hardcoded product configuration" rules.

## Design Goal

Premium, attractive, modern beauty/fashion ecommerce experience that reads as a finished, production-grade consumer brand site — not a developer prototype.

Must NOT look like:
- Admin software / generic Bootstrap template / basic CRUD app / AI-generated placeholder site
- Amazon/Flipkart-style dense marketplace UI
- Overly colorful or template-looking ecommerce

**Preserve** the existing identity: SATVEX (now "Satvex") branding and real uploaded logo, Cormorant Garamond display type, existing warm-ivory/dusty-rose color palette, editorial/minimal-luxury aesthetic, existing product photography once uploaded.

## Design Characteristics
Premium, elegant, minimal, modern, product-focused, strong typography, **intentional** whitespace (not accidental empty space — see Global Layout), beautiful product imagery, smooth transitions, subtle micro-interactions, clear CTAs, mobile-first but making full, deliberate use of desktop width.

## Global Layout — High Priority

Root cause of the current issues: sections sized by min-height/centering tricks rather than by content, and a product grid that doesn't reflow to fill desktop width.

- Consistent max-width container: **1240–1400px** (current token is 1240px — fine, keep or widen slightly to 1320px given the new denser grids).
- Responsive horizontal padding at every breakpoint (already tokenized — reuse, don't reinvent per page).
- Remove artificial `min-height`/centering that leaves large blank areas on wide viewports (this is the root cause of "one small card on a huge screen" on Home/Shop).
- Section height must be driven by content + consistent vertical rhythm (spacing tokens), not by stretching to fill a viewport.
- One shared spacing scale for: header, page header, sections, cards, forms, buttons, footer, mobile layouts — reuse the existing `--space-*` tokens; do not introduce parallel spacing values per page.
- Every page must feel visually complete at 1440px, 1280px, and 1024px — not just "not broken," but intentionally composed.

## Navbar

Preserve current SATVEX visual style; fix spacing/interaction issues.

Desktop: logo (left) · Home / Shop / About / Contact (center) · Search / Wishlist / Cart / Account (right).
- Consistent icon size and spacing; correct cart/wishlist badge position (top-right of icon, not overlapping).
- Clear hover and active-nav states — active link gets a text/underline treatment, not a boxed background (current implementation is close; refine, don't rebuild).
- Sticky header; must never overlap page content (verify z-index + scroll-margin on anchor targets).

Mobile: logo, search, wishlist, cart, hamburger (unchanged from v1 — already reasonable). Do not overcrowd — keep to these five elements.

## Search Experience

Current issue: inline search bar pushes the whole page down.

Replace with:
- Desktop: search icon opens a **dropdown/overlay** panel anchored under the header (not a full-width bar that reflows layout) — input, live-matching products (name/description, existing client-side filter logic is fine for this catalog size), "View all results" linking to `/shop?search=...`.
- Mobile: full-screen or slide-in drawer search, same behavior.
- Lightweight — no page reflow, closes on outside click / Escape / route change.

## Home Page

Keep the existing editorial structure (hero, color showcase, featured products, why-Satvex, CTA, footer); fix sizing/density, don't reinvent sections.

- **Hero**: tighten height (remove excess vertical padding), balance text/image columns, consistent CTA button sizing.
- **Color showcase**: all 8 colors, clickable, selected state updates the shown product image (uses the already-live `showcase` product's variants — real data, already wired).
- **Featured products**: this is the main fix. Replace the current layout (effectively one narrow card on a wide screen) with a real responsive grid: **3–4 columns desktop, 2–3 tablet, 2 mobile**, auto-filling available width (not a fixed narrow column stuck in a wide page). Must scale automatically as more products are added later.

## Shop Page

Rebuild as a real catalog page, not a single narrow column.

- Page header: "Shop" eyebrow, "All Products" heading, live result count.
- Controls row: search (filters the grid, existing client-side approach fine at this catalog size), sort (Featured / Newest / Price low→high / Price high→low / Rating), filters (color, price range, availability=in stock, category — category is a no-op today since there's one category, but build the control so it's ready).
- Grid: same responsive breakpoints as Home's featured grid (3–4 / 2–3 / 2 columns) — **use the same `ProductGrid` component in both places**, not two separate implementations.
- Mobile: filters open in a bottom drawer/modal, not inline (avoids pushing products far down the page).

## Reusable ProductCard (single component, used everywhere)

One `ProductCard` used on Home, Shop, Search results, Wishlist, and future "related products" — no duplicate card markup per page.

Top: product image (real, from `product.images[0]`, existing `ImagePlaceholder` fallback when empty), wishlist toggle button, optional sale badge (`compareAtPrice > price`) / out-of-stock badge (derived from `isActive`, not hardcoded).
Bottom: name, short description (line-clamped), price (+ struck-through compare price when on sale), rating + review count (from the real `rating`/`reviewCount` fields), variant/color count (`variants.length`), stock status, "View Product" affordance (whole card is a link already — keep).

Subtle hover animation only (existing lift/shadow + image scale — keep, don't add more). Keep the card compact — this is a fix for "cards too small in the grid," not "cards should be huge."

## Product Detail Page

Priority page — keep the current two-column structure (gallery left, buy box right), refine density/completeness.

Left: gallery (existing `ProductGallery`, keep), thumbnails, zoom-on-hover (new — subtle, not a full lightbox unless trivial).
Right: name, rating + review count, price (+ compare price), selling-option selector (existing), color selector (existing `ComboColorSelector`), stock status, quantity (for Single option — combos are inherently qty-1-of-a-combo, existing model), wishlist, add-to-cart, buy-now (all existing — keep behavior).
Below: description (existing), a lightweight "Details" block (materials/features — static brand copy, allowed per Data Rule), shipping/returns info (static policy copy), reviews section (shows rating + review count; no submission form per the Scope Decision above), related products (reuses `ProductCard`/`ProductGrid`, simple "other active products" list for now — single-product catalog today, but the section should render correctly once more products exist).

Variant selection already correctly updates image/price via the selected selling option and active variant — preserve this, extend to also reflect stock status and the derived SKU.

## Wishlist Page

Redesign from a plain list into a real product grid page.

Header: "Your Wishlist" + live item count.
Grid: same `ProductGrid`/`ProductCard` pattern, 3–4 columns desktop. Each card: image, name, price, availability, "Add to Cart" (if the product needs a selling-option/color choice, opens a **variant-selection modal/drawer** inline rather than forcing navigation to the product page — new, small modal reusing `SellingOptionSelector`/`ComboColorSelector`), remove.
Empty state: icon, "Your wishlist is waiting", short message, "Browse Products" CTA — via the shared `EmptyState` component (see "Empty / Loading / Error States" below).

## Cart Page

Rebalance into a real two-column ecommerce cart.

Desktop: items list (~65% width, existing `CartItem` rows — refine spacing/alignment) + **sticky** order summary (~35%): subtotal, discount (if a coupon was applied), shipping (currently always "Free" — keep, real value from backend), total, coupon code input + apply (only if the coupon scope-decision is confirmed; otherwise omit the input entirely rather than showing a non-functional one), checkout CTA, continue shopping, clear cart.
"Save for later" per item (only if that scope-decision is confirmed).
Mobile: single column, summary below items, prominent full-width checkout button.

## My Account Page — New, High Priority

Current page (name/email/logout in a small centered card) is replaced with a real account dashboard.

Desktop: left sidebar (Account Overview, My Orders, Wishlist, Addresses, Profile, Change Password, Logout — matches the `AccountSidebar` component) + right content area.
Overview: welcome message with the real customer name, email, phone, **live** total-orders count and wishlist-item count (from existing `GET /orders` and wishlist data — no new backend needed for these two numbers), saved-addresses count (needs the address book scope-decision), quick-action cards linking to Orders/Addresses/Wishlist/Profile.
Mobile: account header + profile summary, horizontal tab or dropdown navigation, content below.

This becomes the new `/account` route family (see `03-frontend.md` routing update) — `/profile` is retired in favor of `/account` + subroutes.

## My Orders Page — New, High Priority

Replace the current bare empty-state page with a real order-management view.

Header: "My Orders", live total count, search (by order id), status filter (All/Pending/Confirmed/Processing/Shipped/Delivered/Cancelled — all real `order.status` values already in the backend).
Order card: order number, date, status badge (top); product thumbnail(s), name, variant/colors, quantity, price (body — all from the existing `order.items[]`); total, "View Details" (right).
Actions: View, **Track** (opens the status timeline — real data, see Scope Decisions), **Cancel** (only shown/enabled while status allows it), **Reorder**.
Order detail: order number, date, items, address, price breakdown, status **timeline** component (`OrderTimeline`) driven by the real status value.
Empty state: shared `EmptyState` — "No orders yet", "Your next favorite piece is waiting.", Shop Collection CTA.

## Checkout Page — New, High Priority

Keep the existing real, server-validated checkout flow (this is working and correct — do not change the pricing/order-creation logic). Rebuild the layout only.

Desktop: ~65% form column + ~35% **sticky** order summary. A simple numbered progress indicator (Information → Shipping → Review → Place Order) — can be a single-page form with clear section headings rather than literal multi-step routing, since the current single-page flow already works; the "steps" are visual grouping, not new navigation.
Customer Information / Shipping Address: same fields as today, just better grouped/spaced (existing fields already match: name, phone, email, address line, city, state, pincode, country).
Saved addresses: shown above the address form when the user has any (needs the address-book scope-decision) — "Use this address" per card, default clearly marked, "+ Add new address".
Order summary: product thumbnail + name + variant + qty + price per line (existing cart data), subtotal, coupon (only if confirmed), shipping (Free), total.
Payment: keep the existing "Payment integration coming soon" notice — do not add fake payment UI.
Place Order: full-width primary button, disabled + loading state while submitting (existing behavior — keep), navigates to `/order-confirmation/:id` on success (existing — keep).
Mobile: single column; order summary collapsible (`Order Summary ▼`); checkout button stays easily reachable.

## Order Confirmation Page

Polish the existing page (logic/data already correct): confirmed checkmark, "Thank you for your order," order number, product summary, total, shipping address, status, "View My Orders" + "Continue Shopping". No functional changes needed, layout/visual polish only.

## Contact Page

Two-column layout replacing the current single narrow centered column.

Left: "Get in touch" heading, brand message (static copy, allowed), contact info pulled from the real Settings record (email/phone/Instagram — already live via `SettingsContext`).
Right: existing form (name, email, message) with validation/loading/success/error states (already implemented — keep the logic, improve the layout balance).
Mobile: single column.

## About Page

Add visual hierarchy and imagery so the page doesn't read as one block of text: brand story (existing copy), philosophy, values, product imagery (real, once available), "Designed in India" note (existing copy already says this), CTA to Shop. Static brand content — allowed per the Data Rule.

## Footer

Keep the current 4-column structure (Brand / Shop / Company / Get in Touch) and real Settings-driven contact block (already implemented) — add Shipping Policy / Return Policy / Terms / Privacy links (static pages or simple placeholder routes if those pages don't exist yet — confirm whether real policy pages are in scope or just footer links for now). Copyright line already uses the real `brandName` — keep.

## Empty / Loading / Error States

Consolidate into three shared components used everywhere (cart, wishlist, orders, search results, addresses, account) instead of ad hoc per-page markup:
- `EmptyState` (already exists — keep using/extending it): icon, heading, short explanation, relevant CTA.
- Skeleton loaders for product cards, product detail, orders, wishlist, cart, account, search — extend the existing `Skeleton` component rather than adding a new one.
- `ErrorState` (already exists): clear message, retry action, "continue shopping" where relevant.

## Responsive Design

Test at 1440 / 1280 / 1024 (desktop), 768 (tablet), 430 / 390 / 375 (mobile) for every page listed above plus modals/drawers. No horizontal scroll, no overlap, no clipped headings, no broken buttons, no excessive whitespace, no desktop-sized content simply shrunk on mobile.

## Component Architecture

See `03-frontend.md` for the updated component list and routing. Reuse existing components (`ProductCard`, `ProductGallery`, `ColorSwatch`, `SellingOptionSelector`, `ComboColorSelector`, `CartItem`, `WishlistItem`, `Modal`, `EmptyState`, `ErrorState`, `Loader`/`Skeleton`, `BrandLogo`, icons) — extend them in place rather than creating parallel versions. New components needed: `ProductGrid`, `PageHeader`, `AccountSidebar`, `OrderCard`, `OrderStatusBadge`, `OrderTimeline`, `AddressCard`, `AddressSelector`, `OrderSummary` (extracted from Cart/Checkout's duplicated summary markup), `CouponInput` (only if confirmed), `QuantitySelector`, `RatingDisplay`, `PriceDisplay`, `SearchOverlay`, `Drawer` (generic slide-in, mobile filters/search/wishlist-variant-picker all reuse it).

## Accessibility

Keyboard navigation, visible focus states, accessible icon buttons (`aria-label`), alt text, form labels + error messages, sufficient contrast, keyboard-trapped modal/drawer handling (Escape to close, focus returns to trigger). Already partially in place (existing `Modal` handles Escape) — extend the same pattern to the new `Drawer` component.

## Performance

Lazy-load below-the-fold images (existing `loading="lazy"` usage — keep, extend to new grids), keep the bundle lean (no new heavy UI libraries — build grids/drawers/modals with the existing plain-CSS approach, consistent with the "no framework" decision made at project start), avoid unnecessary animation, keep CloudFront caching behavior unchanged.

## Data Rule (unchanged, restated for this overhaul)

Frontend must use real backend/API data. Never hardcode price, stock, order status, customer info, wishlist, cart, reviews, or coupons. Static content is allowed only for genuine brand copy (story, philosophy, marketing copy, FAQ-style content) — never for anything that looks like transactional/product data.

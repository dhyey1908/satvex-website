# SATVEX — UI/UX Design Requirements

**Status: v3 — Premium Motion & Icon Overhaul (current).** v2 (below, through the
Performance/Data Rule sections) **shipped**: design tokens, the "Atelier Papillon" visual
system (EB Garamond + Plus Jakarta Sans, sharp/architectural radius scale, charcoal
primary + rose accent), the full page rebuild list in v2, responsive layout fixes across
every page including admin, a global toast + confirm-dialog system, admin-managed
homepage banners and site images (login/about hero images). v3 does not redo that
structural work — it adds a real animation/motion layer, replaces the hand-rolled icon
set with Lucide, and hardens mobile further per the acceptance criteria below. See "v3 —
Motion, Icons & Deeper Mobile Polish" near the end of this file for the new requirements
and implementation phases.

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

Lazy-load below-the-fold images (existing `loading="lazy"` usage — keep, extend to new grids). **Updated for v3:** `framer-motion` and `lucide-react` are the two approved exceptions to "no new heavy UI libraries" (see v3 section below) — both are tree-shakeable and justified by the real-animation/icon-consistency requirement. No other new UI libraries without the same sign-off. Animate only `transform`/`opacity` wherever possible (GPU-friendly, no layout thrash). Avoid continuous/looping expensive animations. Keep CloudFront caching behavior unchanged.

## Data Rule (unchanged, restated for this overhaul)

Frontend must use real backend/API data. Never hardcode price, stock, order status, customer info, wishlist, cart, reviews, or coupons. Static content is allowed only for genuine brand copy (story, philosophy, marketing copy, FAQ-style content) — never for anything that looks like transactional/product data.

---

# v3 — Motion, Icons & Deeper Mobile Polish

Adds a real animation/interaction layer and icon-system consistency on top of the shipped
v2 visual redesign. Everything in v2 above (layout, grids, page structure, components)
stays as-is unless a specific v3 item below says otherwise.

## Resolved Tech Decisions

| Decision | Resolution |
|---|---|
| Animation library | **`framer-motion`.** Used for spring transitions, orchestrated/staggered reveals, crossfades, directional image transitions, scroll-triggered reveals, drawer/modal motion. |
| Icon library | **`lucide-react`.** Replaces the hand-rolled `components/Icons.jsx` (22 custom SVGs). Import only specific icons per usage (tree-shakeable), never bulk-import. |

## Motion System — Principles

- Every animation has a specific purpose: communicate state change, direction, or
  hierarchy — not decoration for its own sake.
- Standard timing tokens (add to `tokens.css` alongside the existing spacing/radius
  scale): `--motion-fast: 150ms`, `--motion-base: 250ms`, `--motion-slow: 400ms`,
  `--motion-spring: { type: 'spring', stiffness: 300, damping: 30 }` (Framer Motion
  transition object, used for selection states — color swatches, tabs, toggles).
- Easing: standard eases for fades/slides (`cubic-bezier(0.16, 1, 0.3, 1)` — already used
  in v2's modal/toast CSS, keep consistent), spring physics (not eased curves) for
  anything that represents a physical selection/toggle (ring indicator, drawer handle).
- Respect `prefers-reduced-motion: reduce` globally — Framer Motion's `useReducedMotion`
  hook (or a shared wrapper) must disable non-essential motion (parallax, entrance
  staggers, floating effects) and fall back to instant/simple opacity transitions.
  Functional transitions (drawer open/close, modal appear) may keep a very short
  fade instead of a slide.
- No animation may block interaction — a user must be able to click "Add to Cart" the
  instant it's visually present, never mid-entrance-animation-locked.
- Stagger children sparingly (product grid entrance, list reveals) — cap total stagger
  delay so a 12-item grid doesn't take a full second to finish appearing (~40–60ms per
  item, max ~6 items staggered, rest appear together).

## Icon System — Lucide Mapping

Replace `components/Icons.jsx` usages 1:1. Suggested mapping (adjust during
implementation if a closer Lucide icon exists):

| Area | Old custom icon | Lucide icon |
|---|---|---|
| Nav / header | SearchIcon, HeartIcon, BagIcon, MenuIcon | `Search`, `Heart`, `ShoppingBag`, `Menu` |
| Account menu | UserIcon, OrderBagIcon, SettingsGearIcon, LogoutIcon | `User`, `Package`, `Settings`, `LogOut` |
| Toast | CheckCircleIcon, AlertCircleIcon, AlertTriangleIcon, InfoIcon, CloseIcon | `CheckCircle2`, `AlertCircle`, `AlertTriangle`, `Info`, `X` |
| Trust rows / pillars | TruckIcon, GiftIcon, LeafIcon, InfinityIcon, BoxIcon, StarIcon | `Truck`, `Gift`, `Leaf`, `Infinity`, `Package`, `Star` |
| Misc | ChevronDownIcon, LocationIcon, QuoteIcon | `ChevronDown`, `MapPin`, `Quote` |
| Orders (new, currently missing) | — | Pending `Clock`, Confirmed `CheckCircle2`, Processing `Package`, Shipped `Truck`, Delivered `PackageCheck`, Cancelled `XCircle` |
| Checkout (new) | — | `MapPin`, `Check`, `ChevronRight`, `Pencil`, `Plus` |
| Cart drawer (new) | — | `Trash2`, `Minus`, `Plus`, `ArrowRight`, `Tag` |
| Quick View / zoom (new) | — | `Eye`, `ZoomIn` |

`ProductCard`'s star rating, wishlist heart, and quick-add bag icon all switch to Lucide
equivalents (`Star`, `Heart`, `ShoppingBag`) with the same fill-on-active behavior already
implemented.

## Per-Area Animation Requirements

Only the delta from what's already shipped (v2) is listed — don't rebuild layout, just
add motion.

**Navbar** — subtle entrance on first load (fade + slight slide-down, once, not on every
route change). Scroll: background/shadow smoothly interpolates (not a hard jump) once
scrolled past ~40px. Active nav-link underline animates its width/position between links
(shared layout animation) instead of the current instant CSS state.

**Hero (Home)** — staged entrance: eyebrow → heading → paragraph → CTAs, each offset by
~80–120ms (Framer Motion `staggerChildren`). Hero image: very subtle parallax on scroll
(a few px of translateY, not aggressive) and a soft entrance (fade + slight
scale-from-1.03, once). Banner carousel crossfades between slides instead of a hard cut.

**Product images / gallery (PDP)** — switching selected thumbnail crossfades the main
image (no instant swap). Variant/color switch on Home's showcase and PDP: main image
crossfades, price/stock/color-label update with a short fade, not an instant text swap.

**Color swatches** — selection ring uses a spring transition (already has the visual ring
via CSS; add the spring motion to the ring scale/opacity). Hover shows a name tooltip
(new — currently only a `title`/no visible tooltip). Keyboard-focusable with the same
visual selected/hover state as pointer interaction (arrow-key navigation between
swatches is a nice-to-have, not required).

**ProductCard hover** — keep existing lift/shadow; add: product info block shifts up
slightly as the "Add to Bag" button reveals (already reveals on hover — add the
coordinated motion instead of a plain opacity pop), wishlist heart does a small
fill+scale burst on click (spring, ~200ms), not just an instant color change.

**Buttons** — shared motion behavior across all `.btn` usages: hover = smooth
background/elevation transition (mostly CSS already), active/press = brief scale-down
(~0.97, existing `:active` transform — keep, verify consistent everywhere), loading state
= small inline spinner replacing/beside the label (new — several submit buttons currently
only change their text, e.g. "Saving…"; add a shared spinner treatment), disabled = clear
opacity/cursor state (existing).

**Cart** — this project has no drawer-based cart (cart is a full page, by design —
confirmed in v2). Keep it a page, not a drawer, for v3 too (don't introduce a slide-out
cart drawer; the pasted spec's "Cart Drawer" section assumes a drawer pattern this app
doesn't use). Add: quantity change animates the number (short crossfade/roll, not an
instant digit swap), item removal animates the row out and remaining rows smoothly
reposition (`AnimatePresence` + `layout` on the cart item list), coupon apply shows a
loading → success/error transition on the button itself.

**Wishlist** — heart-fill burst on add (shared with ProductCard). Removing an item
animates the card out (`AnimatePresence`) rather than an instant disappearance. The
existing `VariantPickerModal` (used for "Add to Cart" from a wishlist card) keeps its
current modal-on-desktop behavior; on mobile it becomes a bottom sheet (see Modals/Drawers
below).

**Account / Orders** — `AccountSidebar` active-tab indicator animates its position
(shared layout animation) instead of an instant background swap. `OrderTimeline` steps
animate progressively (each completed step's fill/checkmark animates in sequence, not all
at once) when the order detail page first renders.

**Checkout** — the existing single-page-with-grouped-sections approach (confirmed in v2,
keep — no literal multi-step routing) gets: address-card selection uses the same spring
ring/selected-state as color swatches, "Place Order" button gets the shared loading-state
treatment and is disabled during submission (already prevents duplicate submits
server-side — this is a UI affordance on top), success navigates to Order Confirmation
with a brief fade transition.

**Modals / Drawers / Bottom sheets** — existing `Modal` component keeps centered-modal
behavior on desktop (fade + scale-in, already added in the UX-polish pass). **New for
v3:** on mobile (≤640px), the same `Modal` component (and `Drawer`) renders as a
bottom sheet — slides up from the bottom, rounded top corners, drag-down-to-dismiss
affordance optional (a visible close button is sufficient if drag gestures add too much
complexity), internal scroll when content is tall, respects safe-area-inset-bottom. Apply
this to: `VariantPickerModal`, `SearchOverlay` (already full-screen-ish on mobile per v2 —
verify it matches this bottom-sheet/full-screen pattern), the Shop page filter panel
(currently inline pills per v2 — decide during implementation whether filters need a
mobile bottom sheet given the pill bar already works well at narrow widths, or keep pills
and skip this one).

**Scroll animations** — section-level reveal (fade + slight translateY, once, via
`whileInView`) on: Home's showcase/featured/pillars/quote/newsletter sections, About
page's pillar cards, Shop's product grid (staggered, capped per the Motion System
principles above). Do not add parallax beyond the hero image.

**Loading / skeleton states** — extend the existing `Skeleton` component's shimmer
(already implemented) to any remaining raw "Loading…" text call sites — audit
`Loader` usages across Account/Orders/Admin and replace bare-text loading with skeleton
shapes matching the eventual content layout where practical (list/card-shaped skeletons,
not just a spinner, for pages that render lists).

**Toast** — already has enter/leave animation and icon-per-type (shipped in the UX-polish
pass) — swap the four icons to Lucide equivalents per the mapping table, no other change
needed.

## Mobile — Acceptance Criteria (v3 hardening pass)

v2 already fixed layout-level mobile issues (verified via automated overflow sweeps across
every page at 360/390/768px — zero horizontal overflow found). v3's mobile work is about
interaction quality, not layout breakage:

- Re-verify zero horizontal overflow at 375 / 390 / 430px specifically (v2's sweep used
  360/390/768 — add 375 and 430 to the matrix since real devices vary).
- Every tappable control (icon buttons, swatches, quantity steppers, close buttons) is at
  least 44×44px hit area, even if the visible icon is smaller (padding, not icon size,
  achieves this — verify `icon-btn`, swatch buttons, modal close buttons).
- No control relies on `:hover` alone to reveal required functionality on mobile (e.g.
  ProductCard's "Add to Bag" reveal-on-hover needs a mobile-visible equivalent — either
  always-visible on touch devices or accessible via tap-through to PDP, verify current
  behavior and fix if hover-only).
- Modals/drawers/bottom sheets never exceed viewport height awkwardly — internal scroll,
  respect safe-area insets on iOS (notch/home-indicator).
- Sticky elements (header, checkout order-summary-on-desktop, PDP add-to-cart-on-mobile if
  added) never overlap content or get obscured by the mobile browser's own UI chrome.

## v3 Implementation Phases

1. Install `framer-motion` + `lucide-react`. Add motion timing tokens to `tokens.css`.
2. Icon swap: replace `components/Icons.jsx` usages file-by-file with Lucide imports
   (global nav/account/toast first — highest visibility — then page-specific icons).
   Delete `Icons.jsx` once every usage is migrated (verify with a repo-wide grep for the
   old import path before deleting).
3. Shared motion primitives: a small `motion/` helpers module (fade-in, stagger
   container, spring-ring, page-transition wrappers) so every page reuses the same
   building blocks instead of ad hoc Framer Motion configs per component.
4. Navbar + Hero (Home) — highest visibility, sets the tone for the rest.
5. Product surfaces: ProductCard, ProductGallery/crossfade, color swatches (Home
   showcase + PDP), Shop grid stagger + scroll reveal.
6. Cart (quantity/removal motion, coupon state), Wishlist (heart burst, removal motion).
7. Account/Orders (sidebar indicator, order timeline sequence), Checkout (address
   selection ring, button loading state).
8. Modal/Drawer → bottom-sheet-on-mobile behavior; apply to VariantPickerModal first
   (most-used), then audit others.
9. About/Contact scroll reveals, remaining icon-audit cleanup.
10. Mobile acceptance-criteria pass (44px targets, hover-only functionality audit,
    375/390/430 overflow re-sweep).
11. Full functional regression test (existing Testing section in
    `17-implementation-rules.md`) + `prefers-reduced-motion` forced-on visual check on
    every page touched.
12. Final visual QA at 1440 / 1280 / 1024 / 768 / 430 / 390 / 375.

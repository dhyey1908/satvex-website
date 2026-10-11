# SATVEX — Premium Feminine Redesign (v4)

## Status
Current design system ("Ink & Rust" in `tokens.css`) is deliberately structured/
editorial: near-black ink, warm bone paper, a single saturated rust-crimson
accent. The new brief asks for the opposite mood — elegant, feminine, soft,
premium beauty/lifestyle — so this is a genuine palette + type swap, not a
tweak. Scope is large (Home page rebuild, product cards, shade selector,
header, a full mobile audit, an image-crossfade pattern used everywhere) so
this follows the same plan-first process used for prior large changes in
this project (motion system v3, payment gateway v2) — implementation starts
after this doc is reviewed.

**Non-negotiable, repeated from the brief:** this is a visual layer change
only. Auth, cart, wishlist, checkout, coupons, GST, COD/shipping charges,
orders, addresses, reviews, admin config, and every API contract stay
exactly as they are. No component gets functionally rewritten — only
restyled, and image/layout components get a crossfade behavior added
without changing what data they receive.

## 1. Color palette (replaces `tokens.css`'s Ink & Rust block)

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#FBF6F0` | Warm ivory page background |
| `--color-surface` | `#FFFFFF` | Cards, header, inputs |
| `--color-surface-muted` | `#F6EAE6` | Soft blush section backgrounds |
| `--color-surface-container` | `#EFDCD6` | Deeper blush containers |
| `--color-surface-container-high` | `#E7CEC6` | Hover/active blush |
| `--color-champagne` | `#E7D9BE` | Warm beige — badges, dividers, secondary accent |
| `--color-text` | `#3A2E2A` | Soft brown-charcoal — headings, primary text |
| `--color-text-muted` | `#7A6B64` | Secondary/supporting text |
| `--color-border` | `#E8DCD6` | Hairlines |
| `--color-primary` | `#3A2E2A` | Dark UI elements (footer, nav text) |
| `--color-accent` | `#6B2737` | **Deep burgundy** — CTAs, links, price emphasis, active states |
| `--color-accent-dark` | `#4E1C28` | Burgundy hover/pressed |
| `--color-accent-light` | `#E7CEC6` | Burgundy-tinted backgrounds (badges, selected states) |
| `--color-accent-gold` | `#B08D57` | Muted gold — rating stars, small premium accents only |
| `--color-success` / `--color-success-bg` | `#3F7D4E` / `#E7F1E5` | unchanged role |
| `--color-error` / `--color-error-bg` | `#A13A2F` / `#F6E2DC` | warmed to fit palette |

Rule enforced throughout: **burgundy and blush are accents, not a wash.**
Most of the page stays ivory/white/soft-brown; color shows up on CTAs,
price, active swatches, and section dividers — never as a full-bleed pink
background (explicit brief constraint).

## 2. Typography

- **Display/headings**: switch from Fraunces to **Playfair Display** (Google
  Fonts) — the standard high-contrast serif pairing for premium beauty/
  fashion brands, more overtly elegant/romantic than Fraunces' quirky-
  editorial feel.
- **Body/UI**: switch from Archivo (grotesque/mechanical) to **Poppins** —
  soft geometric sans, warmer and rounder than Archivo, still highly
  legible for UI at small sizes. Playfair + Poppins is a proven, common
  pairing for this exact aesthetic.
- Hierarchy (largest → smallest): Hero headline (Playfair, ~clamp(2.75rem,
  5vw, 4.5rem)) → Section heading (Playfair, ~2.25rem) → Product name
  (Poppins semibold, ~1.05rem) → Price (Poppins semibold) → Body/supporting
  copy (Poppins regular, ~0.95rem) → Labels/eyebrows (Poppins, uppercase,
  letter-spaced, ~0.75rem).
- Both fonts already load-compatible with the existing Google Fonts setup
  used for Fraunces/Archivo — swap, not a new loading mechanism.

## 3. Home page — section-by-section (highest priority)

1. **Hero** — full-bleed or large split layout, product photo as the
   visual anchor (not surrounded by competing content). Headline: "SATVEX
   — Elegant everyday essentials, designed for her." One primary CTA
   ("Shop Now" / "Shop Butterfly" — reuses the existing dynamic single-
   product copy already in place), one secondary CTA ("Discover Our
   Story"). Entrance: soft fade + slight upward reveal on load, no zoom/
   parallax. Product image gets a very subtle hover drift, nothing more.
2. **Featured Product** — the existing Interactive Showcase section,
   restyled: larger image, price/CTA panel redesigned with the new type
   scale and burgundy CTA.
3. **Choose Your Shade** — promoted into its own clearly-labeled section
   (currently folded into the showcase). Swatches redesigned (see §5),
   selecting a color crossfades the product image (§6), updates name/
   price/stock with no layout jump.
4. **Why SATVEX** — existing 4-pillar grid (already admin-editable from the
   payment/reviews work), restyled to the new card language — soft blush
   card background, burgundy icon accent, Playfair pillar titles.
5. **Product Story / Lifestyle** — new section using the existing quote-
   banner pattern, restyled: burgundy-on-ivory instead of the current
   dark-primary block, so it reads as a quiet brand moment, not a heavy
   dark band.
6. **Curated Collection** — the existing Featured Collection product grid
   (already correctly hidden when there's only one product — unchanged
   logic, just restyled cards).
7. **Brand statement** — short, editorial single-line statement in
   Playfair, generous whitespace either side, no card/box around it.
8. **Final CTA** — simple centered band, one CTA, burgundy accent line or
   background-tint (not full burgundy fill — keep text readable and the
   palette restrained).
9. **Footer** — simplified to the brief's minimal premium direction: logo,
   3–4 link columns, newsletter, socials — restyled, not restructured
   (footer's actual links/content stay as-is).

Newsletter section (currently separate) folds into the footer treatment
rather than staying a standalone mid-page card, matching "minimal premium
footer."

## 4. Header

Desktop: `Logo | Home | Shop | About | Contact | Search | Wishlist | Cart |
Account` — same links as today, restyled (lighter weight, more letter-
spacing, burgundy active-state underline instead of the current accent
color). Mobile: `Logo | Search | Wishlist | Cart | Menu` — same as today's
structure. Height trimmed slightly (`--header-height` 76px → ~68px) for a
more compact, premium feel. Sticky behavior unchanged (already implemented
via `useScroll`/`useTransform` from the motion-system work).

## 5. Product cards, prices, badges, swatches — design-token rules

- **Discount format**, applied everywhere a compare-at price exists:
  `25% OFF  ₹899  ~~₹1,200~~` — percentage badge in a small burgundy-tinted
  pill, sale price in Poppins semibold + burgundy, original price muted
  and struck through, smaller. One shared component/class, not per-page
  reimplementations.
- **Color swatches**: slightly larger touch target on mobile (real tap
  target ≥ 36px even though the visible dot can stay smaller), clearer
  selected-state ring in burgundy, disabled/out-of-stock state kept as the
  existing diagonal-strike treatment, just recolored to the new palette.
- **Cards**: image proportion locked via aspect-ratio (see §7 — no CLS),
  moderate radius (matches existing `--radius-md`/`lg` scale, not pill-
  heavy), soft shadow only on hover (matches the existing "resting border,
  hover elevation" rule already documented in this project's CSS).
- **Buttons**: primary = solid burgundy, hover = `--color-accent-dark`;
  secondary/outline = burgundy text + hairline border; both keep the
  existing size/radius tokens, only recolored.

## 6. Universal image-loading / crossfade pattern

New shared behavior, not a new component per surface — a small hook/
utility (`useCrossfadeImage` or equivalent) applied consistently to: Home
hero/banners, the shade-selector image, the PDP gallery, Shop product
cards, and any other multi-image surface.

Rule: **the previous image never disappears before the next one is ready.**
Concretely — render the current image normally; when the source changes,
preload the new image in memory, and only swap (via opacity crossfade,
matching the existing `crossfade` motion primitive already in
`src/motion/index.js`) once the new image has actually loaded. No
intermediate blank/placeholder frame. Container dimensions are always
reserved via `aspect-ratio` on the wrapper, so nothing shifts layout while
this happens (addresses the CLS requirement in the brief directly).

This reuses the project's existing Framer Motion setup (`crossfade` variant
already exists from the v3 motion work) — extending its usage, not
introducing a new animation system.

## 7. Mobile-first audit

Breakpoints to verify per the brief: 320, 360, 375, 390, 414px, plus
tablet/desktop/large-desktop. Applies to every page, not just Home:
Home, Shop, Product Detail, Cart, Checkout, Account area, Admin (lower
priority — admin is a tool, not the storefront), Footer, Modals, and any
sticky/bottom action bar (PDP mobile add-to-cart bar already exists from
prior mobile-fix work — gets restyled, not rebuilt).

Process: same empirical method already used successfully earlier in this
project — a scripted width-sweep checking `scrollWidth` vs `clientWidth`
at each breakpoint per page, escalating to a DOM walk to pinpoint the
overflowing element wherever a mismatch is found, rather than guessing at
fixes. Mobile Home gets its own intentional section order/sizing per the
brief (large but controlled hero, horizontal shade/product scroll where it
genuinely helps, 16–20px side padding, no shrunk-desktop layouts).

## 8. Animation rules

Reuses the existing Framer Motion primitives (`fadeUp`, `revealOnScroll`,
`staggerContainer`, `crossfade`) already established in `src/motion/index.js`
from the v3 motion work — this redesign restyles what those animate, it
doesn't add a second animation system. Constraints from the brief, applied
project-wide: no aggressive zoom/parallax/flashing/floating elements, hover
states stay subtle (slight lift/drift, not scale-bounce), and every
animated entrance already respects `prefers-reduced-motion` via the
existing motion setup — verified, not re-implemented.

## 9. What's explicitly unaffected

Every item the brief lists as "do not break": auth, product/variant data
and out-of-stock handling, cart, wishlist, checkout (COD + the PayU
Online flow), coupons, GST, COD/shipping charges, discount
pricing, orders (including the new payment lifecycle/auto-confirm work),
addresses, reviews, admin configuration, and all backend APIs. This is a
`tokens.css` + component-styling + layout-markup pass — no service,
controller, validator, or route file should need to change for this work.

## 10. Rollout / review plan

Given the size, propose building and reviewing in this order rather than
one giant change:
1. Token swap (`tokens.css` colors + fonts) — immediately shows the new
   direction across the whole site with zero markup changes, cheap to
   review/course-correct before investing in per-section rebuilds.
2. Home page (hero → shade selector → the rest of the 9 sections, in
   order) — the stated top priority.
3. Shared product-card/price/badge/swatch components — used by Shop, PDP,
   Home's featured grid, so fixing them once cascades everywhere.
4. Header + footer.
5. Remaining pages (Shop, PDP, Cart, Checkout, Account) restyled to match,
   plus the full mobile audit pass across all of them.

## Open questions
1. Palette/type choices above are my concrete recommendation, not
   pre-agreed — confirm before I start, or redirect specific values
   (e.g. a different burgundy shade, a different serif).
2. OK to swap Fraunces/Archivo → Playfair Display/Poppins site-wide, or
   keep one of the current fonts and only change color?
3. Admin panel — restyle to match (lower priority, brief doesn't mention
   it explicitly), or leave its current look untouched and scope this
   entirely to the customer-facing storefront?

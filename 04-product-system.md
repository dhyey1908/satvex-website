# SATVEX — Product, Variant and Combo System

## Product Concept
Current product:
- Butterfly

There are currently 8 colors.

Example initial colors:
- Pink
- Blue
- Purple
- Red
- Green
- Yellow
- White
- Black

Do NOT hardcode these into frontend logic.

## Product Fields
Suggested:
- id
- name
- slug
- shortDescription
- description
- basePrice
- images[]
- videoUrl
- rating (static/decorative display value only, e.g. 4.8 — no review submission or backend in v1)
- reviewCount (admin-editable integer, not a hardcoded frontend number — see `02-ui-ux-design.md` Scope Decisions)
- sku (derived, not stored — see Scope Decisions; computed from productId/variantId, not a persisted field)
- variants[]
- sellingOptions[]
- isActive
- isFeatured
- createdAt
- updatedAt

## Variant Fields
- id
- name
- colorName
- colorCode
- image
- isActive

## Selling Options
Do not hardcode only 1/2/3.

Example:
- Single: quantity 1
- Combo of 2: quantity 2
- Combo of 3: quantity 3

Fields:
- id
- name
- quantity
- price
- compareAtPrice (optional; when set and greater than `price`, the frontend shows a strikethrough/sale badge for this selling option)
- isActive
- allowDuplicateColors

Future examples:
- Combo of 4
- Combo of 5

These must be addable from admin without code changes.

## Color Selection

### Single
Customer selects exactly one color.

### Combo of 2
Customer selects two colors.

### Combo of 3
Customer selects three colors.

Respect allowDuplicateColors.

If false:
- Pink + Pink = invalid

If true:
- Pink + Pink = valid

## Pricing
Price must come from the selected selling option.
Do not calculate combo price from frontend hardcoded values.

## Product Detail Requirements
Show:
- Gallery
- Name
- Description
- Price
- Selling options
- Dynamic color selectors
- Wishlist
- Add to Cart
- Buy Now

## Admin
Admin must be able to:
- Add/edit/delete product
- Add/edit/delete variants
- Change color name/code/image
- Enable/disable variant
- Add/edit/delete selling options
- Change combo quantity
- Change combo price
- Configure duplicate-color behavior
- Mark product featured
- Activate/deactivate product

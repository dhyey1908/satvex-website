# Satvex — Image & Video Guide for Client Assets

This is the reference to send to your client (or photographer) so every image comes back
in the right size the first time. Each section lists exactly where the asset appears on
the site, where you upload it in the admin panel, the recommended dimensions, and the
file format/size limits already enforced by the system.

All images are cropped to fill their slot (center-focused crop, no stretching), so it's
fine if the source photo is a little larger than the target — it is not fine if it's
smaller, or the site will upscale it and it will look soft/blurry. When in doubt, go
bigger: extra resolution costs nothing at upload time.

---

## 1. Logo

- **Where it appears:** Site header (top-left) and footer, on every page.
- **Where to upload:** Admin → Settings → Brand → Logo.
- **Format:** PNG with a transparent background (no white box around it).
- **Recommended size:** 600 × 200 px (or your logo's natural proportions — width is
  flexible, but keep the height around 3–4× the width-to-height ratio you want; the
  site displays it at ~36–40px tall, so anything from 120px tall upward reproduces
  sharply on retina screens).
- **File size limit:** none enforced, but keep it under 500 KB for fast page loads.

---

## 2. Homepage Hero Banner(s)

- **Where it appears:** The large image/video on the right side of the homepage hero,
  directly under the header. Supports multiple rotating slides.
- **Where to upload:** Admin → Banners → Add a Banner.
- **Aspect ratio:** **3:2 (landscape — wider than tall)**
- **Recommended size (image):** **1500 × 1000 px**, JPEG, PNG, WebP or AVIF.
- **Recommended size (video):** **1350 × 900 px**, MP4 (H.264), **10–20 seconds**,
  looping cleanly, **no audio needed** (it plays muted), **under 15 MB** so it loads
  quickly on mobile data.
- **Notes:**
  - If you don't add any banners, the homepage automatically falls back to showing the
    main product photo — nothing breaks either way.
  - Each banner can optionally link somewhere (e.g. `/shop`) when clicked.
  - With 2+ active banners, the homepage auto-rotates between them every 6 seconds.

---

## 3. Sign In / Create Account Page Image

- **Where it appears:** Left panel of the Login and Sign Up pages (desktop only —
  hidden on mobile to save space).
- **Where to upload:** Admin → Settings → Site Images → Sign In / Create Account Page
  Image.
- **Aspect ratio:** **4:5 (portrait)**, but the panel stretches with page height, so a
  taller image (up to 5:6) also works well.
- **Recommended size:** **1000 × 1200 px**, JPEG, PNG, WebP or AVIF.
- **Notes:** A darker or moodier photo works best — white text is overlaid on the
  bottom-left corner of this image.

---

## 4. About Page Image

- **Where it appears:** Top-right of the About page, beside the intro text.
- **Where to upload:** Admin → Settings → Site Images → About Page Image.
- **Aspect ratio:** **4:5 (portrait)**
- **Recommended size:** **1200 × 1500 px**, JPEG, PNG, WebP or AVIF.

---

## 5. Product Photography

- **Where it appears:** Product grid cards (Shop, Home, Wishlist), the main product
  gallery on the Product Detail page, and cart/order line items.
- **Where to upload:** Admin → Products → (select product) → Images / Color Variants.
- **Aspect ratios used on-site:**
  - Product grid cards: **4:5 (portrait)**
  - Product Detail gallery (main image): **1:1 (square)**
- **Recommended size:** **1600 × 1600 px** (square), shot on a clean white or neutral
  background, isolated product, consistent lighting across all colors/variants. A
  single square master image works for both slots above — the grid card view will
  simply crop the sides slightly.
- **Per-color variant images:** if the product has color variants (e.g. 8 colors),
  provide one photo per color at the same size/angle/lighting so the color swatch
  picker looks consistent when switching between shades.
- **File format:** JPEG, PNG, WebP or AVIF.

---

## Quick Reference Table

| Asset | Admin Location | Aspect Ratio | Recommended Size | Format |
|---|---|---|---|---|
| Logo | Settings → Brand | flexible | 600×200 px | PNG (transparent) |
| Homepage Banner (image) | Banners | 3:2 | 1500×1000 px | JPG/PNG/WebP/AVIF |
| Homepage Banner (video) | Banners | 3:2 | 1350×900 px, 10–20s | MP4 |
| Sign In Page Image | Settings → Site Images | 4:5 | 1000×1200 px | JPG/PNG/WebP/AVIF |
| About Page Image | Settings → Site Images | 4:5 | 1200×1500 px | JPG/PNG/WebP/AVIF |
| Product Photo | Products → Images/Variants | 1:1 | 1600×1600 px | JPG/PNG/WebP/AVIF |

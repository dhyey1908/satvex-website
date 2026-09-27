# Placeholder assets

Every file in this folder is a placeholder, not a real product photo or brand asset. They exist so the site renders a complete, working experience before real media is available.

## Replace these when ready

- `logo.svg` — SATVEX wordmark placeholder. Replace with the exported logo.

Product/variant images are no longer placeholder files in this repo. Until real photos are uploaded through the admin panel (Products → image upload, which stores them in S3/CloudFront per `11-s3-media.md`), the frontend shows a plain "Image coming soon" placeholder instead of a fake product photo.

## Logo source

The real logo source file was provided as a CorelDraw file (`Satvex.cdr`) at a local path. This environment cannot open `.cdr` files directly — export it to `.svg` or `.png` from CorelDraw and drop it in here as `logo.svg` (or update the reference in `index.html` / `Header.jsx` if using a different filename/format).

## Once real images exist

Per `11-s3-media.md`, real product/variant images should live in S3 (served via CloudFront), not in this local `public/` folder — this folder is a development-time stand-in only.

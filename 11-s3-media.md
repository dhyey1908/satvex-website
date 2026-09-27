# SATVEX — S3 Media Management

## Purpose
Use S3 for:
- Product images
- Variant images
- Optional product videos
- Branding assets
- SATVEX logo

## Suggested Structure
satvex/
  products/
  variants/
  videos/
  branding/

## Product Images
Do not store binary images in DynamoDB.

Store:
- S3 object key
- public/CDN URL only when appropriate

## Upload Flow
Prefer:
Frontend
→ Backend authorized upload/presigned URL
→ S3

Avoid sending large media through Lambda when a presigned upload is practical.

## Security
Do not expose AWS credentials to frontend.

For private/original assets:
- Use signed access or controlled CDN access.

For public product assets:
- Use CloudFront caching where useful.

## Optimization
Prefer:
- WebP/AVIF where browser support and pipeline allow
- Responsive image sizes
- Thumbnail images
- Lazy loading
- Compression

Do not load original huge images everywhere.

## Logo
Provided local path:
C:\Users\donga\Downloads\Satvex.cdr.zip

If Claude's environment cannot access this Windows path:
- Do not invent the logo
- Create /public/assets/logo/ or equivalent
- Document where the real logo should be placed

The ZIP may contain a CDR source. Use an appropriate exported web asset if available.

## Video
Video support should be optional.
Do not make video mandatory for every product.
Use optimized delivery and avoid unnecessarily large initial downloads.

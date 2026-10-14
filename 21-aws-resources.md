# 21 — AWS Resources (live inventory)

Snapshot of what is actually deployed, taken from the `satvex-backend-dev`
CloudFormation stack and the AWS account on 2026-10-14. Region: **ap-south-1
(Mumbai)**. Names only — no secrets live in this file.

## 0. Two stacks

| | `satvex-backend-dev` (test sandbox) | `satvex-backend-prod` (**live**, default deploy target) |
|---|---|---|
| Tables | `satvex_*_dev` | `satvex_*_prod` |
| Lambdas | `satvex-api-dev`, `satvex-expire-payments-dev`, `satvex-shipment-sweep-dev` | same names with `-prod` |
| API | `nrrrgl72b8` | `v6n4hc1ehc` |
| Site (CloudFront) | `dnjtmuqir7yy3.cloudfront.net` (`E2OZRHF90V5X21`) | `d2hk0vzv74fvua.cloudfront.net` (`E21UV9FOUJKOOT`) |
| Media CDN | `d2sddt7joahbvz.cloudfront.net` | `d14mztig9rueh4.cloudfront.net` |
| Buckets | `satvex-{frontend,media}-dev-<account-id>` | `satvex-{frontend,media}-prod-<account-id>` |
| OTP | MiniMoth sandbox key | MiniMoth live key, no fixed-code numbers |

**Prod is the default target.** Backend: `npm run deploy` (prod) / `npm run deploy:dev` (dev sandbox).
Frontend: `npm run deploy` (prod, `deploy.config.json`) /
`DEPLOY_CONFIG=deploy.config.dev.json npm run deploy` (dev sandbox).

Copying data between stacks: `node src/scripts/migrateStage.js --from dev --to prod
[--dry-run] --replace <old media CDN>=<new media CDN>` (read-only on the source,
safe to re-run; also `aws s3 sync` the media bucket).

Everything in the sections below was captured from the **dev** stack; prod is
identical apart from the names above.

Source of truth: `backend/template.yaml` (AWS SAM). Change infrastructure there
and run `npm run deploy` in `backend/`; do not edit resources by hand.

## 1. Services at a glance

| AWS service | What it does for SATVEX | Count |
|---|---|---|
| **CloudFormation / SAM** | Deploys everything below as one stack | 1 stack |
| **Lambda** | Runs the API and the two scheduled jobs (Node.js 22) | 3 functions |
| **API Gateway (HTTP API)** | Public HTTPS front door for the API | 1 |
| **DynamoDB** | All application data | 13 tables |
| **S3** | Website files, uploaded media | 2 buckets |
| **CloudFront** | CDN + HTTPS for the website and for media | 2 distributions |
| **EventBridge** | Schedules for the background jobs | 2 rules |
| **SES** | Transactional email (contact form, order mail) | 1 region config |
| **SNS** | SMS fallback path (only when MiniMoth is not the OTP provider) | account-level |
| **IAM** | One execution role per Lambda | 3 roles |
| **CloudWatch Logs** | Lambda logs | 3 log groups |

External (non-AWS) services: **MiniMoth** (OTP), **PayU** (payments),
**Shiprocket** (shipping).

## 2. Lambda functions

| Name | Handler | Runtime | Memory | Timeout | Trigger |
|---|---|---|---|---|---|
| `satvex-api-dev` | `src/lambda.handler` | nodejs22.x | 256 MB | 10 s | API Gateway (all routes) |
| `satvex-expire-payments-dev` | `src/expirePayments.handler` | nodejs22.x | 256 MB | 60 s | EventBridge, `rate(1 hour)` |
| `satvex-shipment-sweep-dev` | `src/shipmentSweep.handler` | nodejs22.x | 256 MB | 60 s | EventBridge, `rate(10 minutes)` |

* Expire-payments: closes unpaid online orders past their deadline.
* Shipment sweep: retries Shiprocket shipment creation for paid orders.

## 3. DynamoDB tables

All tables use **on-demand (PAY_PER_REQUEST)** billing. Env var = the name the
backend reads (`backend/src/config/env.js`).

| Table | Env var | Primary key | Secondary indexes (GSI) | TTL |
|---|---|---|---|---|
| `satvex_users_dev` | `TABLE_USERS` | `userId` | `verifiedPhone-index` (verifiedPhone), `email-index` (email) | – |
| `satvex_otp_codes_dev` | `TABLE_OTP_CODES` | `phone` | – | `expiresAt` |
| `satvex_refresh_tokens_dev` | `TABLE_REFRESH_TOKENS` | `tokenHash` | `userId-index` (userId) | `expiresAt` |
| `satvex_products_dev` | `TABLE_PRODUCTS` | `productId` | – | – |
| `satvex_orders_dev` | `TABLE_ORDERS` | `orderId` | `userId-createdAt-index`, `shiprocketOrderId-index`, `paymentStatus-paymentExpiresAt-index` | – |
| `satvex_shipment_jobs_dev` | `TABLE_SHIPMENT_JOBS` | `jobId` | `status-nextAttemptAt-index` | – |
| `satvex_carts_dev` | `TABLE_CARTS` | `userId` + `cartItemId` | – | – |
| `satvex_wishlists_dev` | `TABLE_WISHLISTS` | `userId` + `productId` | – | – |
| `satvex_addresses_dev` | `TABLE_ADDRESSES` | `userId` + `addressId` | – | – |
| `satvex_contacts_dev` | `TABLE_CONTACTS` | `contactId` | – | – |
| `satvex_settings_dev` | `TABLE_SETTINGS` | `settingsId` | – | – |
| `satvex_coupons_dev` | `TABLE_COUPONS` | `code` | – | – |
| `satvex_coupon_redemptions_dev` | `TABLE_COUPON_REDEMPTIONS` | `redemptionId` | `code-createdAt-index` | – |
| `satvex_reviews_dev` | `TABLE_REVIEWS` | `reviewId` | `productId-createdAt-index` | – |

Notable per-record fields added since the original schema:
products → `testimonialVideos[]` (max 20), selling-option `costPrice`;
orders → `quotedFreightCharge`, item `costPrice`; contacts → `status`
(`open`/`resolved`); OTP rows → `sendCount`, `windowStartedAt`, `locked`.

Tables are scanned in full (paginated) by the admin lists; fine at current
volume, revisit with indexes if orders grow into the tens of thousands.

## 4. Storage and delivery

| Resource | Name / id | Purpose |
|---|---|---|
| S3 bucket | `satvex-frontend-dev-<account-id>` | React build (index.html, assets/) |
| S3 bucket | `satvex-media-dev-<account-id>` | Product images/videos, review + enquiry uploads (`satvex/<folder>/…`) |
| CloudFront | `E2OZRHF90V5X21` → `dnjtmuqir7yy3.cloudfront.net` | The website (deploy script invalidates `/*`) |
| CloudFront | `EV1SB7L032BAT` | Media CDN (`CLOUDFRONT_MEDIA_URL`) |
| Origin Access Control | `FrontendOAC`, `MediaOAC` | Buckets are private; only CloudFront can read |

Media upload folders: `products`, `variants`, `videos`, `branding`, `banners`
(admin only), `reviews` (customers), `enquiries` (public contact form).

## 5. API and background plumbing

| Resource | Name / id |
|---|---|
| HTTP API | `nrrrgl72b8` → `https://nrrrgl72b8.execute-api.ap-south-1.amazonaws.com/api` |
| Stage | `$default` |
| EventBridge rules | `…HourlySweep` (`rate(1 hour)`), `…TenMinuteSweep` (`rate(10 minutes)`) |
| IAM roles | `ApiFunctionRole`, `ExpirePaymentsFunctionRole`, `ShipmentSweepFunctionRole` |
| Log groups | `/aws/lambda/satvex-api-dev`, `…-expire-payments-dev`, `…-shipment-sweep-dev` |

## 6. Email (SES)

* Account is in **sandbox**: 200 emails / 24 h and only to verified
  addresses. Verified identities today: 8 addresses (store + team/test).
* Before real customers rely on order emails, request **SES production
  access** in the AWS console, then verify a sending domain.
* Sender configured via `SES_SENDER_EMAIL`.

## 7. Configuration parameters (`template.yaml` → Lambda env)

Values are in `backend/samconfig.toml` (gitignored). **Never commit them.**

| Parameter | Lambda env var | Secret? | Notes |
|---|---|---|---|
| `Stage` | – | no | Suffix for every resource name (`dev`) |
| `FrontendOrigin` | `FRONTEND_ORIGIN` | no | CORS / redirect origin |
| `JwtSecret` | `JWT_SECRET` | **yes** | Signs access tokens |
| `SesSenderEmail` | `SES_SENDER_EMAIL` | no | |
| `ResetTokenExpiresMin` | `RESET_TOKEN_EXPIRES_MIN` | no | |
| `PayuMerchantKey` / `PayuMerchantSalt` / `PayuEnv` | `PAYU_*` | **yes** (key, salt) | `PayuEnv=test` until PayU live approval |
| `ShiprocketEmail` / `ShiprocketPassword` / `ShiprocketWebhookToken` / `ShiprocketBaseUrl` | `SHIPROCKET_*` | **yes** | |
| `MiniMothApiKey` | `MINIMOTH_API_KEY` | **yes** | `mm_test_` sandbox / `mm_live_` real |
| `OtpProvider` | `OTP_PROVIDER` | no | blank = MiniMoth when a key is set; `sns` = rollback |
| `OtpTestPhones` | `OTP_TEST_PHONES` | no | Fixed-code `123456` numbers — **clear before launch** |
| `SnsSenderId` | `SNS_SENDER_ID` | no | Only for the SNS fallback |

## 8. Going-live checklist (using this stack as production)

- [ ] `MiniMothApiKey` → `mm_live_…`, redeploy backend
- [ ] `OtpTestPhones` → blank
- [ ] PayU live key/salt + `PayuEnv=live` (needs PayU go-live approval)
- [ ] SES production access
- [ ] Shiprocket account / pickup address confirmed
- [ ] DynamoDB point-in-time recovery enabled on `orders`, `users`, `products`
- [ ] CloudWatch alarm on Lambda errors for `satvex-api-dev`
- [ ] Running `npm run dev` locally writes to these same tables — avoid, or
      point `backend/.env` at separate tables

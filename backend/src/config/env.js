require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendOrigin: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  // Manual override for this Lambda's own public URL, used to build PayU's
  // surl/furl (PayU's hosted checkout POSTs the payment result straight
  // back to a backend URL we give it, not the frontend). Normally unset —
  // orderController derives this from the incoming request's own Host
  // instead, which also works for local dev and avoids a circular
  // CloudFormation dependency (see resolveApiBaseUrl). Only set this if a
  // proxy/tunnel in front of the API rewrites the Host header.
  apiBaseUrl: process.env.API_BASE_URL || '',

  awsRegion: required('AWS_REGION', 'ap-south-1'),

  tables: {
    users: required('TABLE_USERS', 'satvex_users'),
    products: required('TABLE_PRODUCTS', 'satvex_products'),
    orders: required('TABLE_ORDERS', 'satvex_orders'),
    carts: required('TABLE_CARTS', 'satvex_carts'),
    wishlists: required('TABLE_WISHLISTS', 'satvex_wishlists'),
    contacts: required('TABLE_CONTACTS', 'satvex_contacts'),
    settings: required('TABLE_SETTINGS', 'satvex_settings'),
    addresses: required('TABLE_ADDRESSES', 'satvex_addresses'),
    coupons: required('TABLE_COUPONS', 'satvex_coupons'),
    reviews: required('TABLE_REVIEWS', 'satvex_reviews'),
    couponRedemptions: required('TABLE_COUPON_REDEMPTIONS', 'satvex_coupon_redemptions'),
    shipmentJobs: required('TABLE_SHIPMENT_JOBS', 'satvex_shipment_jobs'),
    otpCodes: required('TABLE_OTP_CODES', 'satvex_otp_codes'),
    refreshTokens: required('TABLE_REFRESH_TOKENS', 'satvex_refresh_tokens'),
  },

  minimoth: {
    // MiniMoth OTP service (WhatsApp first, SMS fallback). Server-side secret —
    // `mm_live_...` in production, `mm_test_...` for the sandbox (no real
    // messages; the code is always 000000). See services/minimothService.js.
    apiKey: process.env.MINIMOTH_API_KEY || '',
    baseUrl: (process.env.MINIMOTH_BASE_URL || 'https://api.minimoth.dev').replace(/\/$/, ''),
  },

  sns: {
    // DLT-approved alphanumeric Sender ID — required for SMS to actually
    // deliver to Indian numbers (TRAI/DLT regulation), separate from AWS
    // IAM permissions. Left blank, SNS uses its default sender behavior,
    // which Indian carriers will typically reject.
    senderId: process.env.SNS_SENDER_ID || '',
  },

  s3: {
    mediaBucket: process.env.S3_MEDIA_BUCKET,
    cloudFrontMediaUrl: process.env.CLOUDFRONT_MEDIA_URL,
  },

  // PayU India (replaces Cashfree). No session/order-create API call — the
  // hosted checkout is a classic hashed HTML form POST (see payuService.js).
  // 'test' | 'production' — controls which PayU host is used, both for the
  // payment form action and the verify/refund post-service calls.
  payu: {
    key: process.env.PAYU_MERCHANT_KEY,
    salt: process.env.PAYU_MERCHANT_SALT,
    env: process.env.PAYU_ENV || 'test',
  },

  // Real Shiprocket account — no sandbox/live split on Shiprocket's own
  // side. Gated by settings.shiprocket.enabled (defaults false) so no real
  // API calls happen until explicitly turned on.
  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
    // Compared against the x-api-key header Shiprocket sends if a webhook
    // security token is configured in their panel (Settings > API >
    // Webhooks) — our own choice of value, set in both places. Optional —
    // left blank, the check is skipped (not recommended once this is live).
    webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN,
    // Overridable so the exact same code can be pointed at Shiprocket's
    // sandbox environment for testing without a code change — defaults to
    // the real production API.
    baseUrl: process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in',
    serviceabilityBaseUrl: process.env.SHIPROCKET_SERVICEABILITY_BASE_URL || 'https://serviceability.shiprocket.in',
  },

  jwt: {
    secret: required('JWT_SECRET', 'dev-only-insecure-secret'),
    // Short-lived on purpose — this is the token actually sent on every
    // request (cookie + Bearer fallback), so its blast radius if leaked
    // should be small. Long-lived sessions come from the separate,
    // revocable refresh token below instead (see auth.refreshTokenMaxAgeDays
    // and refreshTokenService.js), not from extending this.
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '1h',
  },

  // The refresh token itself is an opaque random value (not a JWT, no
  // secret/expiresIn needed here) — this is only the absolute cap, from
  // first login, on how long a device can keep silently refreshing before
  // a fresh OTP is required again. See refreshTokenService.js.
  auth: {
    refreshTokenMaxAgeDays: Number(process.env.REFRESH_TOKEN_MAX_AGE_DAYS || 730),
  },

  resetTokenExpiresMin: Number(process.env.RESET_TOKEN_EXPIRES_MIN || 30),

  ses: {
    senderEmail: process.env.SES_SENDER_EMAIL,
  },

  otp: {
    // Deliberately NOT wired into template.yaml's Environment.Variables for
    // ApiFunction — this can only ever be true when running the backend
    // locally. otpService.js also requires nodeEnv !== 'production' before
    // honoring this, and NODE_ENV: production is hardcoded in template.yaml
    // for the deployed Lambda, so this is double-gated against ever
    // reaching the live site.
    testMode: process.env.OTP_TEST_MODE === 'true',
    // Which service delivers/verifies codes: 'minimoth' or 'sns' (the original
    // AWS SNS SMS path). Unset = MiniMoth whenever a key is configured, else
    // SNS — so adding the key is all it takes, and OTP_PROVIDER=sns is the
    // one-line rollback that leaves the key in place.
    provider: (process.env.OTP_PROVIDER || (process.env.MINIMOTH_API_KEY ? 'minimoth' : 'sns')).toLowerCase(),
    // Unlike testMode above, THIS one is wired into template.yaml and does
    // reach the deployed Lambda — deliberately scoped to specific numbers
    // only (not a blanket bypass) so it's safe to deploy: every number NOT
    // in this list still goes through the real OTP path in production.
    testPhones: (process.env.OTP_TEST_PHONES || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  },
};

module.exports = env;

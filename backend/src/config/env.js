require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const frontendOrigin = required('FRONTEND_ORIGIN', 'http://localhost:5173');

// frontendOrigin is a CORS allowlist and can be comma-separated (local dev +
// production together, e.g. "http://localhost:5173,https://real-site.com").
// Anything that builds an actual outbound link for a real person — a
// password-reset email, a product URL sent to a payment provider — must use
// a single real origin, never the raw multi-value CORS string (that
// produces a literally broken, comma-containing URL). Picks the first
// non-local entry; falls back to whatever's first if everything looks local
// (e.g. pure local dev with no production origin configured at all).
const publicSiteUrl = (() => {
  const origins = frontendOrigin.split(',').map((o) => o.trim());
  return origins.find((o) => !/localhost|127\.0\.0\.1/.test(o)) || origins[0];
})();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendOrigin,
  publicSiteUrl,

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
  },

  s3: {
    mediaBucket: process.env.S3_MEDIA_BUCKET,
    cloudFrontMediaUrl: process.env.CLOUDFRONT_MEDIA_URL,
  },

  cashfree: {
    appId: process.env.CASHFREE_APP_ID,
    secretKey: process.env.CASHFREE_SECRET_KEY,
    // 'sandbox' | 'production' — controls which Cashfree base URL is used.
    env: process.env.CASHFREE_ENV || 'sandbox',
    apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
  },

  // SANDBOX ONLY until GoKwik confirms the open questions in
  // gokwik_integration_notes.md — gated separately from Cashfree via
  // settings.payments.gokwikEnabled/gokwikTestUserIds, never auto-enabled.
  gokwik: {
    appId: process.env.GOKWIK_APP_ID,
    appSecret: process.env.GOKWIK_APP_SECRET,
    // 'sandbox' | 'production' — controls which GoKwik base URL is used.
    env: process.env.GOKWIK_ENV || 'sandbox',
  },

  // Real Shiprocket account — there's no sandbox/production split the way
  // Cashfree/GoKwik have (one account, real panel). Gated by
  // settings.shipping.shiprocketEnabled (defaults false) so no real
  // shipments are created until explicitly turned on, same caution as the
  // other two integrations use a test-user allowlist for.
  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
    // Compared against the x-api-key header Shiprocket sends if a webhook
    // security token is configured in their panel (Settings > API >
    // Webhooks) — our own choice of value, set in both places.
    webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN,
  },

  jwt: {
    secret: required('JWT_SECRET', 'dev-only-insecure-secret'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  resetTokenExpiresMin: Number(process.env.RESET_TOKEN_EXPIRES_MIN || 30),

  ses: {
    senderEmail: process.env.SES_SENDER_EMAIL,
  },
};

module.exports = env;

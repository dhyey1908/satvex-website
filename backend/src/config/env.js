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
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  resetTokenExpiresMin: Number(process.env.RESET_TOKEN_EXPIRES_MIN || 30),

  ses: {
    senderEmail: process.env.SES_SENDER_EMAIL,
  },
};

module.exports = env;

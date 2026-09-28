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

const { z } = require('zod');

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(1, 'Please write your review.').max(2000),
  // URLs only (already-uploaded via /reviews/upload-url) — this endpoint
  // never receives raw file data itself, so there's nothing to validate
  // type/size-wise here; that happens at upload time.
  images: z.array(z.string().trim().url()).max(3, 'Up to 3 images per review.').default([]),
});

// A genuine review the owner received outside the site (WhatsApp, Instagram,
// email...) and is entering by hand. `date` is the day the customer wrote it.
const adminCreateReviewSchema = z.object({
  productId: z.string().trim().min(1),
  userName: z.string().trim().min(2, 'Enter the reviewer name.').max(60),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(1, 'Please write your review.').max(2000),
  // Photos the customer sent, already uploaded (URLs only), same limit as customers get.
  images: z.array(z.string().trim().url()).max(3, 'Up to 3 images per review.').default([]),
  // The owner confirms this customer really bought the product (shows the "Verified Purchase" badge).
  verifiedPurchase: z.boolean().default(true),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD.').optional(),
});

module.exports = { createReviewSchema, adminCreateReviewSchema };

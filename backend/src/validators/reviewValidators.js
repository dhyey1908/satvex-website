const { z } = require('zod');

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(10, 'Please write at least 10 characters.').max(2000),
  // URLs only (already-uploaded via /reviews/upload-url) — this endpoint
  // never receives raw file data itself, so there's nothing to validate
  // type/size-wise here; that happens at upload time.
  images: z.array(z.string().trim().url()).max(3, 'Up to 3 images per review.').default([]),
});

module.exports = { createReviewSchema };

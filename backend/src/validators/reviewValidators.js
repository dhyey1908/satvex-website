const { z } = require('zod');

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(10, 'Please write at least 10 characters.').max(2000),
});

module.exports = { createReviewSchema };

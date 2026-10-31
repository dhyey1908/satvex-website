const { z } = require('zod');
const logger = require('../utils/logger');
const { ok } = require('../utils/response');

// Errors the browser hit in the bag / checkout (a failed add, a refetch that failed...). Logged so they show up in our
// logs instead of staying in one customer's console. Small, validated, and rate-limited; nothing here is trusted.
const reportSchema = z.object({
  area: z.string().trim().max(40).default('cart'),
  message: z.string().trim().max(300),
  status: z.number().int().min(0).max(599).optional(),
  code: z.string().trim().max(60).optional(),
  path: z.string().trim().max(200).optional(),
});

async function report(req, res) {
  const parsed = reportSchema.safeParse(req.body);
  if (parsed.success) logger.warn('Client error', { ...parsed.data, userAgent: String(req.get('user-agent') || '').slice(0, 160) });
  ok(res, { logged: parsed.success });
}

module.exports = { report };

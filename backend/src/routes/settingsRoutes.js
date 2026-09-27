const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const settingsService = require('../services/settingsService');
const { ok } = require('../utils/response');

const router = express.Router();

// Public read-only endpoint so the site footer/header can render contact
// info and the Instagram link without requiring admin auth.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    ok(res, { settings });
  })
);

module.exports = router;

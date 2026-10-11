const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { attachUserIfPresent } = require('../middleware/auth');
const settingsService = require('../services/settingsService');
const { ok } = require('../utils/response');

const router = express.Router();

// Public read-only endpoint so the site footer/header can render contact
// info and the Instagram link without requiring admin auth. attachUserIfPresent
// (optional auth) lets it compute a per-viewer paymentsOnlineAvailable flag
// without ever exposing the raw onlineTestUserIds allowlist to the client —
// that list staying private is what keeps sandbox-only testing invisible to
// everyone else.
router.get(
  '/',
  attachUserIfPresent,
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    const { onlineEnabled, onlineTestUserIds } = settings.payments || {};
    const paymentsOnlineAvailable = Boolean(
      onlineEnabled || (req.user && (onlineTestUserIds || []).includes(req.user.id))
    );
    const activeAnnouncements = await settingsService.getActiveAnnouncements(settings.announcements);
    const { payments, ...publicSettings } = settings;
    ok(res, { settings: { ...publicSettings, paymentsOnlineAvailable, announcements: activeAnnouncements } });
  })
);

module.exports = router;

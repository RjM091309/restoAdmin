// ============================================
// LOYVERSE ROUTES
// ============================================
// File: routes/loyverseRoutes.js
// Description: Routes for Loyverse sync operations
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/unifiedAuth');
const LoyverseController = require('../controllers/loyverseController');

// NOTE: These routes are registered on the main app (not under routes/apiRoutes.js),
// so we keep the /api prefix here to match the docs.

// GET /api/loyverse/status
router.get('/api/loyverse/status', authenticate, requireAdmin, LoyverseController.getSyncStatus);

// POST /api/loyverse/sync
// Optional query/body:
// - branch_id
// - limit
// - incremental (true/false)
// - since (ISO string/date) -> override incremental checkpoint for backfill
// - max_receipts, max_pages (safety)
router.post('/api/loyverse/sync', authenticate, requireAdmin, LoyverseController.syncReceipts);

// POST /api/loyverse/auto-sync/start
router.post('/api/loyverse/auto-sync/start', authenticate, requireAdmin, LoyverseController.startAutoSync);

// POST /api/loyverse/auto-sync/stop
router.post('/api/loyverse/auto-sync/stop', authenticate, requireAdmin, LoyverseController.stopAutoSync);

module.exports = router;



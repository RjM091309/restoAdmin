const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/unifiedAuth');
const AnalyticsAiController = require('../controllers/analyticsAiController');

router.post('/api/analytics/ai-chat', authenticate, requireAdmin, AnalyticsAiController.chat);
router.post('/api/analytics/management-brief', authenticate, requireAdmin, AnalyticsAiController.managementBrief);

module.exports = router;

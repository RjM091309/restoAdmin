// ============================================
// OPERATION CATEGORY ROUTES
// ============================================
// File: routes/operationCategoryRoutes.js
// Description: Routes for operation_category endpoints
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/unifiedAuth');
const OperationCategoryController = require('../controllers/operationCategoryController');

// GET - Fetch all operation categories (optionally filtered by branch_id)
// URL (via Vite proxy): /data-api/operation-category?branch_id=...
router.get('/operation-category', authenticate, OperationCategoryController.getAll);

module.exports = router;


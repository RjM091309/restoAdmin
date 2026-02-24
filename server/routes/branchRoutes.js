// ============================================
// BRANCH ROUTES
// ============================================
// File: routes/branchRoutes.js
// Description: Routes for branch management
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/unifiedAuth');
const BranchController = require('../controllers/branchController');

// Branch management page route removed - use API endpoints instead

// Branch selection routes removed (non-admin = ONE branch only; admin = ALL branches)

// Branch switcher (dashboard/topbar)
router.get('/options', authenticate, BranchController.getBranchOptions);
router.post('/set-current', authenticate, BranchController.setCurrentBranch);

// Get branches (admin sees all; non-admin sees assigned)
router.get('/', authenticate, BranchController.getAll);

// Admin-only: view branches for a user (used by web UI)
router.get('/user/:userId/branches', authenticate, requireAdmin, BranchController.getBranchesByUser);

// Get branch by ID or code (admin-only)
router.get('/:id', authenticate, requireAdmin, BranchController.getById);

// Create branch (admin only)
router.post('/', authenticate, requireAdmin, BranchController.create);

// Update branch (admin only)
router.put('/:id', authenticate, requireAdmin, BranchController.update);

// Delete branch (soft delete)
router.delete('/:id', authenticate, requireAdmin, BranchController.delete);

// Get users by branch (admin only)
router.get('/:branchId/users', authenticate, requireAdmin, BranchController.getUsersByBranch);

// User-Branch assignment (admin only) - used by web UI
router.post('/assign', authenticate, requireAdmin, BranchController.assignUserToBranch);
router.post('/remove', authenticate, requireAdmin, BranchController.removeUserFromBranch);
router.post('/set-user-branches', authenticate, requireAdmin, BranchController.setUserBranches);

module.exports = router;


// ============================================
// OPERATION CATEGORY CONTROLLER
// ============================================
// File: controllers/operationCategoryController.js
// Description: Handles operation_category-related business logic
// ============================================

const OperationCategoryModel = require('../models/operationCategoryModel');
const ApiResponse = require('../utils/apiResponse');

class OperationCategoryController {
	static _resolveBranchId(req) {
		const raw =
			req.session?.branch_id ||
			req.query?.branch_id ||
			req.body?.branch_id ||
			req.body?.BRANCH_ID ||
			req.user?.branch_id ||
			null;

		if (raw === null || raw === undefined || raw === '' || raw === 'all') return null;
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}

	static async getAll(req, res) {
		try {
			const branchId = OperationCategoryController._resolveBranchId(req);
			const rows = await OperationCategoryModel.getAll(branchId);
			return ApiResponse.success(res, rows, 'Operation categories retrieved successfully');
		} catch (error) {
			console.error('[OPERATION CATEGORY] getAll error:', error);
			return ApiResponse.error(res, 'Failed to fetch operation categories', 500, error.message);
		}
	}
}

module.exports = OperationCategoryController;


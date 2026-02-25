const InventoryModel = require('../models/inventoryModel');
const ApiResponse = require('../utils/apiResponse');

class InventoryController {
	static _resolveBranchId(req) {
		const raw =
			req.query?.branch_id ||
			req.body?.branch_id ||
			req.body?.BRANCH_ID ||
			req.session?.branch_id ||
			req.user?.branch_id ||
			null;
		if (raw === null || raw === undefined || raw === '' || raw === 'all') return null;
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}

	static _resolvePayload(req) {
		return {
			ITEM_NAME: req.body.ITEM_NAME || req.body.name || '',
			CATEGORY_ID: req.body.CATEGORY_ID || req.body.categoryId || null,
			CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.category || null,
			STOCK_QTY: req.body.STOCK_QTY ?? req.body.stock ?? 0,
			UNIT: req.body.UNIT || req.body.unit || 'pcs',
			UNIT_COST: req.body.UNIT_COST ?? req.body.unitCost ?? 0,
			REORDER_LEVEL: req.body.REORDER_LEVEL ?? req.body.reorderLevel ?? 0,
			STATUS_FLAG: req.body.STATUS_FLAG || req.body.status || 'In Stock',
		};
	}

	static async getAll(req, res) {
		try {
			const branchId = InventoryController._resolveBranchId(req);
			const rows = await InventoryModel.getAll(branchId);
			return ApiResponse.success(res, rows, 'Inventory items retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch inventory items', 500, error.message);
		}
	}

	static async getById(req, res) {
		try {
			const { id } = req.params;
			const row = await InventoryModel.getById(id);
			if (!row) return ApiResponse.notFound(res, 'Inventory item');
			return ApiResponse.success(res, row, 'Inventory item retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch inventory item', 500, error.message);
		}
	}

	static async create(req, res) {
		try {
			const payload = InventoryController._resolvePayload(req);
			if (!payload.ITEM_NAME || String(payload.ITEM_NAME).trim() === '') {
				return ApiResponse.badRequest(res, 'Item name is required');
			}

			const branchId = InventoryController._resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');

			const userId = req.session?.user_id || req.user?.user_id || null;
			const id = await InventoryModel.create({
				BRANCH_ID: branchId,
				...payload,
				user_id: userId,
			});

			return ApiResponse.created(res, { id }, 'Inventory item created successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create inventory item', 500, error.message);
		}
	}

	static async update(req, res) {
		try {
			const { id } = req.params;
			const payload = InventoryController._resolvePayload(req);
			if (!payload.ITEM_NAME || String(payload.ITEM_NAME).trim() === '') {
				return ApiResponse.badRequest(res, 'Item name is required');
			}

			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.update(id, {
				...payload,
				user_id: userId,
			});
			if (!ok) return ApiResponse.notFound(res, 'Inventory item');
			return ApiResponse.success(res, null, 'Inventory item updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update inventory item', 500, error.message);
		}
	}

	static async delete(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.delete(id, userId);
			if (!ok) return ApiResponse.notFound(res, 'Inventory item');
			return ApiResponse.success(res, null, 'Inventory item deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete inventory item', 500, error.message);
		}
	}
}

module.exports = InventoryController;

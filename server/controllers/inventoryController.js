const InventoryModel = require('../models/inventoryModel');
const ExpenseIngestionService = require('../services/expenseIngestionService');
const ApiResponse = require('../utils/apiResponse');

function resolveBranchId(req) {
	const raw = req.session?.branch_id || req.query.branch_id || req.body?.branch_id || req.body?.BRANCH_ID || req.user?.branch_id || null;
	if (raw === null || raw === undefined || raw === '' || raw === 'all') return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function formatDatePht(value) {
	if (!value) return '';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
		const parsed = new Date(trimmed);
		if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10);
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Manila',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(parsed);
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return '';
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Manila',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(value);
	}
	return String(value).slice(0, 10);
}

class InventoryController {
	static async getProducts(req, res) {
		try {
			const branchId = resolveBranchId(req);
			const rows = await InventoryModel.getProducts(branchId);
			return ApiResponse.success(res, rows, 'Products retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch products', 500, error.message);
		}
	}

	static async createProduct(req, res) {
		try {
			const branchId = resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');
			const userId = req.session?.user_id || req.user?.user_id || null;
			const id = await InventoryModel.createProduct({
				BRANCH_ID: branchId,
				CATEGORY_ID: req.body.CATEGORY_ID || req.body.categoryId,
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.category,
				PRODUCT_NAME: req.body.PRODUCT_NAME || req.body.name,
				UNIT: req.body.UNIT || req.body.unit,
				TYPE: req.body.TYPE || req.body.type,
				STATUS: req.body.STATUS || req.body.status,
				PRICE: req.body.PRICE ?? req.body.price,
				STOCK: req.body.STOCK ?? req.body.stock,
				SKU: req.body.SKU || req.body.sku,
				BARCODE: req.body.BARCODE || req.body.barcode,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			const created = await InventoryModel.getProductById(id);
			return ApiResponse.created(res, { id, product: created }, 'Product created successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create product', 500, error.message);
		}
	}

	static async updateProduct(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.updateProduct(id, {
				CATEGORY_ID: req.body.CATEGORY_ID || req.body.categoryId,
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.category,
				PRODUCT_NAME: req.body.PRODUCT_NAME || req.body.name,
				UNIT: req.body.UNIT || req.body.unit,
				TYPE: req.body.TYPE || req.body.type,
				STATUS: req.body.STATUS || req.body.status,
				PRICE: req.body.PRICE ?? req.body.price,
				STOCK: req.body.STOCK ?? req.body.stock,
				SKU: req.body.SKU || req.body.sku,
				BARCODE: req.body.BARCODE || req.body.barcode,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			if (!ok) return ApiResponse.notFound(res, 'Product');
			return ApiResponse.success(res, null, 'Product updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update product', 500, error.message);
		}
	}

	static async deleteProduct(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.deleteProduct(id, userId);
			if (!ok) return ApiResponse.notFound(res, 'Product');
			return ApiResponse.success(res, null, 'Product deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete product', 500, error.message);
		}
	}

	static async getMaterials(req, res) {
		try {
			const branchId = resolveBranchId(req);
			const rows = await InventoryModel.getMaterials(branchId);
			return ApiResponse.success(res, rows, 'Materials retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch materials', 500, error.message);
		}
	}

	static async createMaterial(req, res) {
		try {
			const branchId = resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');
			const userId = req.session?.user_id || req.user?.user_id || null;
			const id = await InventoryModel.createMaterial({
				BRANCH_ID: branchId,
				CATEGORY_ID: req.body.CATEGORY_ID || req.body.categoryId,
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.category,
				MATERIAL_NAME: req.body.MATERIAL_NAME || req.body.name,
				UNIT: req.body.UNIT || req.body.unit,
				STATUS: req.body.STATUS || req.body.status,
				STOCK: req.body.STOCK ?? req.body.stock,
				UNIT_COST: req.body.UNIT_COST ?? req.body.unitCost,
				SKU: req.body.SKU || req.body.sku,
				BARCODE: req.body.BARCODE || req.body.barcode,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			const created = await InventoryModel.getMaterialById(id);
			return ApiResponse.created(res, { id, material: created }, 'Material created successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create material', 500, error.message);
		}
	}

	static async updateMaterial(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.updateMaterial(id, {
				CATEGORY_ID: req.body.CATEGORY_ID || req.body.categoryId,
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.category,
				MATERIAL_NAME: req.body.MATERIAL_NAME || req.body.name,
				UNIT: req.body.UNIT || req.body.unit,
				STATUS: req.body.STATUS || req.body.status,
				STOCK: req.body.STOCK ?? req.body.stock,
				UNIT_COST: req.body.UNIT_COST ?? req.body.unitCost,
				SKU: req.body.SKU || req.body.sku,
				BARCODE: req.body.BARCODE || req.body.barcode,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			if (!ok) return ApiResponse.notFound(res, 'Material');
			return ApiResponse.success(res, null, 'Material updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update material', 500, error.message);
		}
	}

	static async deleteMaterial(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.deleteMaterial(id, userId);
			if (!ok) return ApiResponse.notFound(res, 'Material');
			return ApiResponse.success(res, null, 'Material deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete material', 500, error.message);
		}
	}

	static async getMenuMappings(req, res) {
		try {
			const { menuId } = req.params;
			const rows = await InventoryModel.getMappingsByMenuIds([Number(menuId)]);
			const mapped = rows.map((row) => ({
				id: row.IDNo,
				menu_id: row.MENU_ID,
				product_id: row.PRODUCT_ID,
				material_id: row.MATERIAL_ID,
				quantity: Number(row.QUANTITY || 0),
			}));
			return ApiResponse.success(res, mapped, 'Menu mappings retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch menu mappings', 500, error.message);
		}
	}

	static async saveMenuMappings(req, res) {
		try {
			const { menuId } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const raw = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
			const cleaned = raw
				.map((row) => ({
					product_id: row.product_id ? Number(row.product_id) : null,
					material_id: row.material_id ? Number(row.material_id) : null,
					quantity: Number(row.quantity || 0),
				}))
				.filter((row) => (row.product_id || row.material_id) && row.quantity > 0);

			await InventoryModel.replaceMenuMappings(Number(menuId), cleaned, userId);
			return ApiResponse.success(res, null, 'Menu mappings updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to save menu mappings', 500, error.message);
		}
	}

	static async getStockIns(req, res) {
		try {
			const branchId = resolveBranchId(req);
			const rows = await InventoryModel.getStockIns(branchId);
			const mapped = rows.map((row) => ({
				id: row.IDNo,
				branch_id: row.BRANCH_ID,
				resource_type: row.RESOURCE_TYPE,
				resource_id: row.RESOURCE_ID,
				resource_name: row.PRODUCT_NAME || row.MATERIAL_NAME || '',
				resource_unit: row.RESOURCE_UNIT || '',
				qty_added: Number(row.QTY_ADDED || 0),
				prev_stock: row.PREV_STOCK !== null && row.PREV_STOCK !== undefined ? Number(row.PREV_STOCK) : null,
				new_stock: row.NEW_STOCK !== null && row.NEW_STOCK !== undefined ? Number(row.NEW_STOCK) : null,
				unit_cost: Number(row.UNIT_COST || 0),
				prev_unit_cost: row.PREV_UNIT_COST !== null && row.PREV_UNIT_COST !== undefined ? Number(row.PREV_UNIT_COST) : null,
				new_unit_cost: row.NEW_UNIT_COST !== null && row.NEW_UNIT_COST !== undefined ? Number(row.NEW_UNIT_COST) : null,
				total_cost: Number(row.TOTAL_COST || 0),
				supplier_name: row.SUPPLIER_NAME || '',
				reference_no: row.REFERENCE_NO || '',
				note: row.NOTE || '',
				stock_in_date: formatDatePht(row.STOCK_IN_DATE),
				encoded_dt: row.ENCODED_DT,
			}));
			return ApiResponse.success(res, mapped, 'Stock-in records retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch stock-in records', 500, error.message);
		}
	}

	static async createStockIn(req, res) {
		try {
			const branchId = resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');
			const userId = req.session?.user_id || req.user?.user_id || null;
			const resourceType = req.body.resource_type || req.body.RESOURCE_TYPE;
			const resourceId = req.body.resource_id ?? req.body.RESOURCE_ID;
			const qtyAdded = req.body.qty_added ?? req.body.QTY_ADDED;
			const unitCost = req.body.unit_cost ?? req.body.UNIT_COST;
			if (resourceType !== 'product' && resourceType !== 'material') {
				return ApiResponse.badRequest(res, 'resource_type must be product or material');
			}
			const result = await InventoryModel.createStockIn({
				BRANCH_ID: branchId,
				RESOURCE_TYPE: resourceType,
				RESOURCE_ID: resourceId,
				QTY_ADDED: qtyAdded,
				UNIT_COST: unitCost,
				SUPPLIER_NAME: req.body.supplier_name || req.body.SUPPLIER_NAME,
				REFERENCE_NO: req.body.reference_no || req.body.REFERENCE_NO,
				NOTE: req.body.note || req.body.NOTE,
				STOCK_IN_DATE: req.body.stock_in_date || req.body.STOCK_IN_DATE,
				user_id: userId,
			});
			await ExpenseIngestionService.recordStockInExpense(result, userId);
			return ApiResponse.created(res, { id: result.stockInId }, 'Stock-in recorded successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create stock-in record', 500, error.message);
		}
	}

	static async getAuditTrail(req, res) {
		try {
			const branchId = resolveBranchId(req);
			const rows = await InventoryModel.getAuditTrail(branchId, {
				resourceType: req.query.resource_type || null,
				resourceId: req.query.resource_id || null,
				search: req.query.search || null,
			});
			const mapped = rows.map((row) => ({
				event_id: row.EVENT_ID,
				event_type: row.EVENT_TYPE,
				branch_id: row.BRANCH_ID,
				resource_type: row.RESOURCE_TYPE,
				resource_id: row.RESOURCE_ID,
				resource_name: row.RESOURCE_NAME || '',
				resource_unit: row.RESOURCE_UNIT || '',
				event_date: formatDatePht(row.EVENT_DATE),
				event_dt: row.EVENT_DT,
				qty_change: Number(row.QTY_CHANGE || 0),
				stock_before: row.STOCK_BEFORE !== null && row.STOCK_BEFORE !== undefined ? Number(row.STOCK_BEFORE) : null,
				stock_after: row.STOCK_AFTER !== null && row.STOCK_AFTER !== undefined ? Number(row.STOCK_AFTER) : null,
				cost_before: row.COST_BEFORE !== null && row.COST_BEFORE !== undefined ? Number(row.COST_BEFORE) : null,
				cost_after: row.COST_AFTER !== null && row.COST_AFTER !== undefined ? Number(row.COST_AFTER) : null,
				txn_unit_cost: row.TXN_UNIT_COST !== null && row.TXN_UNIT_COST !== undefined ? Number(row.TXN_UNIT_COST) : null,
				txn_total_cost: row.TXN_TOTAL_COST !== null && row.TXN_TOTAL_COST !== undefined ? Number(row.TXN_TOTAL_COST) : null,
				supplier_name: row.SUPPLIER_NAME || '',
				reference_no: row.REFERENCE_NO || '',
				note: row.NOTE || '',
				active: Number(row.ACTIVE || 0) === 1,
			}));
			return ApiResponse.success(res, mapped, 'Inventory audit trail retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch inventory audit trail', 500, error.message);
		}
	}

	static async updateStockIn(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const resourceType = req.body.resource_type || req.body.RESOURCE_TYPE;
			const resourceId = req.body.resource_id ?? req.body.RESOURCE_ID;
			const qtyAdded = req.body.qty_added ?? req.body.QTY_ADDED;
			const unitCost = req.body.unit_cost ?? req.body.UNIT_COST;
			if (resourceType !== 'product' && resourceType !== 'material') {
				return ApiResponse.badRequest(res, 'resource_type must be product or material');
			}
			const updated = await InventoryModel.updateStockIn(id, {
				RESOURCE_TYPE: resourceType,
				RESOURCE_ID: resourceId,
				QTY_ADDED: qtyAdded,
				UNIT_COST: unitCost,
				SUPPLIER_NAME: req.body.supplier_name || req.body.SUPPLIER_NAME,
				REFERENCE_NO: req.body.reference_no || req.body.REFERENCE_NO,
				NOTE: req.body.note || req.body.NOTE,
				STOCK_IN_DATE: req.body.stock_in_date || req.body.STOCK_IN_DATE,
				user_id: userId,
			});
			if (updated.oldResourceType && updated.oldResourceType !== updated.resourceType) {
				await ExpenseIngestionService.disableStockInExpense(updated.stockInId, updated.oldResourceType, userId);
			}
			await ExpenseIngestionService.recordStockInExpense(updated, userId);
			return ApiResponse.success(res, null, 'Stock-in updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update stock-in record', 500, error.message);
		}
	}

	static async deleteStockIn(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const deleted = await InventoryModel.deleteStockIn(id, userId);
			await ExpenseIngestionService.disableStockInExpense(deleted.stockInId, deleted.resourceType, userId);
			return ApiResponse.success(res, null, 'Stock-in deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete stock-in record', 500, error.message);
		}
	}

	static async getCategories(req, res) {
		try {
			const branchId = resolveBranchId(req);
			const rows = await InventoryModel.getCategories(branchId);
			return ApiResponse.success(res, rows, 'Categories retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch categories', 500, error.message);
		}
	}

	static async createCategory(req, res) {
		try {
			const branchId = resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');
			const userId = req.session?.user_id || req.user?.user_id || null;
			const id = await InventoryModel.createCategory({
				BRANCH_ID: branchId,
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.name,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			return ApiResponse.created(res, { id }, 'Category created successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create category', 500, error.message);
		}
	}

	static async updateCategory(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.updateCategory(id, {
				CATEGORY_NAME: req.body.CATEGORY_NAME || req.body.name,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description,
				user_id: userId,
			});
			if (!ok) return ApiResponse.notFound(res, 'Category');
			return ApiResponse.success(res, null, 'Category updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update category', 500, error.message);
		}
	}

	static async deleteCategory(req, res) {
		try {
			const { id } = req.params;
			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await InventoryModel.deleteCategory(id, userId);
			if (!ok) return ApiResponse.notFound(res, 'Category');
			return ApiResponse.success(res, null, 'Category deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete category', 500, error.message);
		}
	}
}

module.exports = InventoryController;

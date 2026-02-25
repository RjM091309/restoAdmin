const ExpenseModel = require('../models/expenseModel');
const ApiResponse = require('../utils/apiResponse');

function resolveBranchId(req) {
	const raw =
		req.session?.branch_id ||
		req.query.branch_id ||
		req.body?.branch_id ||
		req.body?.BRANCH_ID ||
		req.user?.branch_id ||
		null;
	if (raw === null || raw === undefined || raw === '' || raw === 'all') return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
	if (value === undefined || value === null || value === '') return null;
	if (value === true || value === 'true' || value === '1' || value === 1) return true;
	if (value === false || value === 'false' || value === '0' || value === 0) return false;
	return null;
}

function csvEscape(value) {
	const text = String(value ?? '');
	if (/[",\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

class ExpenseController {
	static async _resolveCategoryInput(rawCategoryId, rawCategoryName, rawCategoryType) {
		const fallbackName = String(rawCategoryName || '').trim();
		const fallbackType = String(rawCategoryType || '').trim() || 'Others';
		return {
			categoryId: rawCategoryId ? Number(rawCategoryId) : null,
			categoryName: fallbackName || 'Others',
			categoryType: fallbackType || 'Others',
		};
	}

	static _buildFilters(req) {
		return {
			branchId: resolveBranchId(req),
			dateFrom: req.query.date_from || req.query.start_date || null,
			dateTo: req.query.date_to || req.query.end_date || null,
			category: req.query.category || null,
			categoryId: req.query.category_id || null,
			categoryType: req.query.category_type || null,
			subCategory: req.query.sub_category || null,
			status: req.query.status || null,
			sourceType: req.query.source_type || null,
			isAuto: parseBoolean(req.query.is_auto),
			search: req.query.search || null,
			period: req.query.period === 'daily' ? 'daily' : 'monthly',
		};
	}

	static async getAll(req, res) {
		try {
			const filters = ExpenseController._buildFilters(req);
			const rows = await ExpenseModel.getAll(filters);
			return ApiResponse.success(res, rows, 'Expenses retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch expenses', 500, error.message);
		}
	}

	static async create(req, res) {
		try {
			const branchId = resolveBranchId(req);
			if (!branchId) return ApiResponse.badRequest(res, 'Branch ID is required');

			const amount = Number(req.body.AMOUNT ?? req.body.amount ?? 0);
			if (!Number.isFinite(amount) || amount < 0) {
				return ApiResponse.badRequest(res, 'Amount must be a valid non-negative number');
			}

			const resolvedCategory = await ExpenseController._resolveCategoryInput(
				req.body.CATEGORY_ID || req.body.category_id || req.body.categoryId,
				req.body.CATEGORY || req.body.category,
				req.body.CATEGORY_TYPE || req.body.category_type || req.body.categoryType
			);

			const expenseDate = req.body.EXPENSE_DATE || req.body.expenseDate || req.body.expense_date;
			if (!expenseDate) return ApiResponse.badRequest(res, 'Expense date is required');

			const userId = req.session?.user_id || req.user?.user_id || null;
			const id = await ExpenseModel.create({
				BRANCH_ID: branchId,
				EXPENSE_DATE: expenseDate,
				CATEGORY_ID: resolvedCategory.categoryId,
				CATEGORY: resolvedCategory.categoryName,
				CATEGORY_TYPE: resolvedCategory.categoryType,
				SUB_CATEGORY: req.body.SUB_CATEGORY || req.body.sub_category || req.body.subCategory || null,
				STATUS: req.body.STATUS || req.body.status || 'Approved',
				SOURCE_TYPE: 'manual',
				SOURCE_REF_ID: null,
				DESCRIPTION: req.body.DESCRIPTION || req.body.description || null,
				VENDOR_PROVIDER: req.body.VENDOR_PROVIDER || req.body.vendor_provider || req.body.vendorProvider || null,
				AMOUNT: amount,
				IS_AUTO: false,
				user_id: userId,
			});

			return ApiResponse.created(res, { id }, 'Expense created successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to create expense', 500, error.message);
		}
	}

	static async update(req, res) {
		try {
			const { id } = req.params;
			const current = await ExpenseModel.getById(id);
			if (!current || !current.ACTIVE) return ApiResponse.notFound(res, 'Expense');
			if (current.IS_AUTO === 1) return ApiResponse.badRequest(res, 'Auto-generated expenses cannot be edited manually');

			const amount = Number(req.body.AMOUNT ?? req.body.amount ?? 0);
			if (!Number.isFinite(amount) || amount < 0) {
				return ApiResponse.badRequest(res, 'Amount must be a valid non-negative number');
			}

			const resolvedCategory = await ExpenseController._resolveCategoryInput(
				req.body.CATEGORY_ID || req.body.category_id || req.body.categoryId || current.CATEGORY_ID,
				req.body.CATEGORY || req.body.category || current.CATEGORY,
				req.body.CATEGORY_TYPE || req.body.category_type || req.body.categoryType || current.CATEGORY_TYPE
			);

			const expenseDate = req.body.EXPENSE_DATE || req.body.expenseDate || req.body.expense_date;
			if (!expenseDate) return ApiResponse.badRequest(res, 'Expense date is required');

			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await ExpenseModel.update(id, {
				EXPENSE_DATE: expenseDate,
				CATEGORY_ID: resolvedCategory.categoryId,
				CATEGORY: resolvedCategory.categoryName,
				CATEGORY_TYPE: resolvedCategory.categoryType,
				SUB_CATEGORY: req.body.SUB_CATEGORY || req.body.sub_category || req.body.subCategory || current.SUB_CATEGORY || null,
				STATUS: req.body.STATUS || req.body.status || current.STATUS || 'Approved',
				DESCRIPTION: req.body.DESCRIPTION || req.body.description || null,
				VENDOR_PROVIDER: req.body.VENDOR_PROVIDER || req.body.vendor_provider || req.body.vendorProvider || current.VENDOR_PROVIDER || null,
				AMOUNT: amount,
				user_id: userId,
			});
			if (!ok) return ApiResponse.notFound(res, 'Expense');
			return ApiResponse.success(res, null, 'Expense updated successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to update expense', 500, error.message);
		}
	}

	static async delete(req, res) {
		try {
			const { id } = req.params;
			const current = await ExpenseModel.getById(id);
			if (!current || !current.ACTIVE) return ApiResponse.notFound(res, 'Expense');
			if (current.IS_AUTO === 1) return ApiResponse.badRequest(res, 'Auto-generated expenses cannot be deleted manually');

			const userId = req.session?.user_id || req.user?.user_id || null;
			const ok = await ExpenseModel.delete(id, userId);
			if (!ok) return ApiResponse.notFound(res, 'Expense');
			return ApiResponse.success(res, null, 'Expense deleted successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to delete expense', 500, error.message);
		}
	}

	static async getSummary(req, res) {
		try {
			const filters = ExpenseController._buildFilters(req);
			const summary = await ExpenseModel.getSummary(filters);
			return ApiResponse.success(res, summary, 'Expense summary retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch expense summary', 500, error.message);
		}
	}

	static async getByCategory(req, res) {
		try {
			const filters = ExpenseController._buildFilters(req);
			const rows = await ExpenseModel.getCategoryBreakdown(filters);
			return ApiResponse.success(res, rows, 'Expense category breakdown retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch expense category breakdown', 500, error.message);
		}
	}

	static async getTrend(req, res) {
		try {
			const filters = ExpenseController._buildFilters(req);
			const rows = await ExpenseModel.getTrend(filters);
			return ApiResponse.success(res, rows, 'Expense trend retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, 'Failed to fetch expense trend', 500, error.message);
		}
	}

	static async exportCsv(req, res) {
		try {
			const filters = ExpenseController._buildFilters(req);
			const rows = await ExpenseModel.getExportRows(filters);
			const header = [
				'ID',
				'Date',
				'Branch',
				'Category Type',
				'Category',
				'Sub Category',
				'Status',
				'Source',
				'Vendor/Provider',
				'Description',
				'Amount',
				'Type',
			];
			const lines = [
				header.join(','),
				...rows.map((row) =>
					[
						row.IDNo,
						row.EXPENSE_DATE,
						row.BRANCH_NAME || '',
						row.CATEGORY_TYPE || '',
						row.CATEGORY || '',
						row.SUB_CATEGORY || '',
						row.STATUS || '',
						row.SOURCE_TYPE || '',
						row.VENDOR_PROVIDER || '',
						row.DESCRIPTION || '',
						Number(row.AMOUNT || 0).toFixed(2),
						row.IS_AUTO ? 'Auto' : 'Manual',
					]
						.map(csvEscape)
						.join(',')
				),
			];

			res.setHeader('Content-Type', 'text/csv; charset=utf-8');
			res.setHeader('Content-Disposition', `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`);
			return res.status(200).send(lines.join('\n'));
		} catch (error) {
			return ApiResponse.error(res, 'Failed to export expenses CSV', 500, error.message);
		}
	}
}

module.exports = ExpenseController;

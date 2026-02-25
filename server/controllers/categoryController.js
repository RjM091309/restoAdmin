// ============================================
// CATEGORY CONTROLLER
// ============================================
// File: controllers/categoryController.js
// Description: Handles category-related business logic
// ============================================

const CategoryModel = require('../models/categoryModel');
const TranslationService = require('../utils/translationService');
const ApiResponse = require('../utils/apiResponse');

class CategoryController {
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

	static _resolvePayload(req) {
		return {
			CAT_NAME: req.body.CAT_NAME || req.body.CATEGORY_NAME || req.body.name || '',
			CAT_DESC: req.body.CAT_DESC || req.body.DESCRIPTION || req.body.description || null,
		};
	}

	static async _translateRows(rows, targetLanguage) {
		if (!Array.isArray(rows) || rows.length === 0) return rows;
		if (!targetLanguage || !TranslationService.isAvailable()) return rows;

		try {
			const translated = rows.map((row) => ({ ...row }));

			const nameIndexes = [];
			const names = [];
			const descIndexes = [];
			const descriptions = [];

			translated.forEach((row, index) => {
				if (row.CAT_NAME) {
					nameIndexes.push(index);
					names.push(row.CAT_NAME);
				}
				if (row.CAT_DESC) {
					descIndexes.push(index);
					descriptions.push(row.CAT_DESC);
				}
			});

			if (names.length > 0) {
				const translatedNames = await TranslationService.translateBatch(names, targetLanguage);
				translatedNames.forEach((value, i) => {
					const rowIndex = nameIndexes[i];
					if (translated[rowIndex]) translated[rowIndex].CAT_NAME = value || translated[rowIndex].CAT_NAME;
				});
			}

			if (descriptions.length > 0) {
				const translatedDescriptions = await TranslationService.translateBatch(descriptions, targetLanguage);
				translatedDescriptions.forEach((value, i) => {
					const rowIndex = descIndexes[i];
					if (translated[rowIndex]) translated[rowIndex].CAT_DESC = value || translated[rowIndex].CAT_DESC;
				});
			}

			return translated;
		} catch (error) {
			console.error('[CATEGORY CONTROLLER] Translation error:', error.message);
			return rows;
		}
	}

	static async getAll(req, res) {
		try {
			const branchId = CategoryController._resolveBranchId(req);
			const categories = await CategoryModel.getAll(branchId);
			const targetLanguage = req.query.lang || req.query.language || req.cookies?.lang || null;
			const data = await CategoryController._translateRows(categories, targetLanguage);
			return ApiResponse.success(res, data, 'Categories retrieved successfully');
		} catch (error) {
			console.error('Error fetching categories:', error);
			return ApiResponse.error(res, 'Failed to fetch categories', 500, error.message);
		}
	}

	static async getById(req, res) {
		try {
			const { id } = req.params;
			const category = await CategoryModel.getById(id);
			if (!category) return ApiResponse.notFound(res, 'Category');

			const targetLanguage = req.query.lang || req.query.language || req.cookies?.lang || null;
			const [translated] = await CategoryController._translateRows([category], targetLanguage);
			return ApiResponse.success(res, translated || category, 'Category retrieved successfully');
		} catch (error) {
			console.error('Error fetching category:', error);
			return ApiResponse.error(res, 'Failed to fetch category', 500, error.message);
		}
	}

	static async create(req, res) {
		try {
			const payload = CategoryController._resolvePayload(req);
			if (!payload.CAT_NAME || String(payload.CAT_NAME).trim() === '') {
				return ApiResponse.badRequest(res, 'Category name is required');
			}

			const user_id = req.session?.user_id || req.user?.user_id;
			if (!user_id) return ApiResponse.badRequest(res, 'User ID is required');

			const branchId = CategoryController._resolveBranchId(req);
			const categoryId = await CategoryModel.create({
				CAT_NAME: payload.CAT_NAME,
				CAT_DESC: payload.CAT_DESC,
				BRANCH_ID: branchId,
				user_id,
			});

			return ApiResponse.created(res, { id: categoryId }, 'Category created successfully');
		} catch (error) {
			console.error('Error creating category:', error);
			return ApiResponse.error(res, 'Failed to create category', 500, error.message);
		}
	}

	static async update(req, res) {
		try {
			const { id } = req.params;
			const payload = CategoryController._resolvePayload(req);
			if (!payload.CAT_NAME || String(payload.CAT_NAME).trim() === '') {
				return ApiResponse.badRequest(res, 'Category name is required');
			}

			const user_id = req.session?.user_id || req.user?.user_id || null;
			const updated = await CategoryModel.update(id, {
				CAT_NAME: payload.CAT_NAME,
				CAT_DESC: payload.CAT_DESC,
				user_id,
			});

			if (!updated) return ApiResponse.notFound(res, 'Category');
			return ApiResponse.success(res, null, 'Category updated successfully');
		} catch (error) {
			console.error('Error updating category:', error);
			return ApiResponse.error(res, 'Failed to update category', 500, error.message);
		}
	}

	static async delete(req, res) {
		try {
			const { id } = req.params;
			const user_id = req.session?.user_id || req.user?.user_id || null;
			const deleted = await CategoryModel.delete(id, user_id);

			if (!deleted) return ApiResponse.notFound(res, 'Category');
			return ApiResponse.success(res, null, 'Category deleted successfully');
		} catch (error) {
			console.error('Error deleting category:', error);
			return ApiResponse.error(res, 'Failed to delete category', 500, error.message);
		}
	}
}

module.exports = CategoryController;


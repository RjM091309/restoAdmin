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

	// Get all categories
	static async getAll(req, res) {
		try {
			// Prioritize session branch_id, but allow overrides from query/body if needed
			const branchId = req.session?.branch_id || req.query.branch_id || req.body?.branch_id || req.user?.branch_id || null;

			const categories = await CategoryModel.getAll(branchId);
			
			// Get target language from query parameter, cookie, or default to 'en'
			const targetLanguage = req.query.lang || req.query.language || req.cookies?.lang || 'en';
			
			console.log(`[CATEGORY CONTROLLER] Target language: ${targetLanguage}`);
			console.log(`[CATEGORY CONTROLLER] Translation service available: ${TranslationService.isAvailable()}`);
			
			// Apply translation based on target language
			// Category names: translate only if not Korean (Korean names stay in Korean)
			// Descriptions: ALWAYS translate to selected language (English descriptions should be translated to Korean, Japanese, Chinese, etc.)
			if (TranslationService.isAvailable()) {
				// Separate handling for descriptions - always translate them
				try {
					// First, translate descriptions (always, regardless of target language)
					const descTextsToTranslate = [];
					const descTextMapping = [];
					
					categories.forEach(cat => {
						if (cat.CAT_DESC) {
							descTextsToTranslate.push(cat.CAT_DESC);
							descTextMapping.push({ cat: cat });
						}
					});
					
					if (descTextsToTranslate.length > 0) {
						const descTranslations = await TranslationService.translateBatch(descTextsToTranslate, targetLanguage);
						descTranslations.forEach((translation, index) => {
							if (descTextMapping[index]) {
								descTextMapping[index].cat.CAT_DESC = translation || descTextMapping[index].cat.CAT_DESC;
							}
						});
					}
				} catch (descError) {
					console.error('[CATEGORY CONTROLLER] Description translation error:', descError.message);
				}
				
				// Then, translate category names (always translate to target language)
				// This handles both Korean-to-other-languages AND English-to-other-languages
				try {
				// Collect all texts to translate (category names only)
				// Include both Korean and English category names - auto-detect will handle it
				const textsToTranslate = [];
				const textMapping = []; // Track which field each text belongs to
				
				categories.forEach(cat => {
					// Category names: translate to target language (handles both Korean and English source)
					// Auto-detect will determine if source is Korean or English
					if (cat.CAT_NAME) {
						textsToTranslate.push(cat.CAT_NAME);
						textMapping.push({ type: 'name', cat: cat });
					}
				});
				
				if (textsToTranslate.length > 0) {
					console.log(`[CATEGORY CONTROLLER] Translating ${textsToTranslate.length} category names to ${targetLanguage}`);
					console.log(`[CATEGORY CONTROLLER] Sample texts:`, textsToTranslate.slice(0, 3));
					
					// Translate in batch - auto-detect source language
					// This handles both Korean-to-other-languages AND English-to-other-languages
					// Google Translate will auto-detect if the source is Korean or English
					const translations = await TranslationService.translateBatch(textsToTranslate, targetLanguage);
					
					console.log(`[CATEGORY CONTROLLER] Received ${translations.length} translations`);
					console.log(`[CATEGORY CONTROLLER] Sample translations:`, translations.slice(0, 3));
					
					// Map translations back to categories
					translations.forEach((translation, index) => {
						const mapping = textMapping[index];
						if (mapping && mapping.type === 'name') {
							const originalText = mapping.cat.CAT_NAME;
							mapping.cat.CAT_NAME = translation || mapping.cat.CAT_NAME;
							if (translation && translation !== originalText) {
								console.log(`[CATEGORY CONTROLLER] Translated: "${originalText}" → "${translation}"`);
							}
						}
					});
				} else {
					console.log(`[CATEGORY CONTROLLER] No category names to translate (targetLanguage: ${targetLanguage})`);
				}
			} catch (nameError) {
				console.error('[CATEGORY CONTROLLER] Category name translation error:', nameError.message);
				console.error('[CATEGORY CONTROLLER] Error stack:', nameError.stack);
			}
			}
			
			return ApiResponse.success(res, categories, 'Categories retrieved successfully');
		} catch (error) {
			console.error('Error fetching categories:', error);
			return ApiResponse.error(res, 'Failed to fetch categories', 500, error.message);
		}
	}

	// Get category by ID
	static async getById(req, res) {
		try {
			const { id } = req.params;
			const category = await CategoryModel.getById(id);
			
			if (!category) {
				return ApiResponse.notFound(res, 'Category');
			}

			return ApiResponse.success(res, category, 'Category retrieved successfully');
		} catch (error) {
			console.error('Error fetching category:', error);
			return ApiResponse.error(res, 'Failed to fetch category', 500, error.message);
		}
	}

	// Create new category
	static async create(req, res) {
		try {
			const { CAT_NAME, CAT_DESC } = req.body;

			if (!CAT_NAME || CAT_NAME.trim() === '') {
				return ApiResponse.badRequest(res, 'Category name is required');
			}

			const user_id = req.session.user_id || req.user?.user_id;
			const branch_id = req.session?.branch_id || req.body?.BRANCH_ID || req.query?.branch_id || null;

			if (!user_id) {
				return ApiResponse.badRequest(res, 'User ID is required');
			}

			const categoryId = await CategoryModel.create({
				CAT_NAME,
				CAT_DESC,
				BRANCH_ID: branch_id,
				user_id
			});

			return ApiResponse.created(res, { id: categoryId }, 'Category created successfully');
		} catch (error) {
			console.error('Error creating category:', error);
			return ApiResponse.error(res, 'Failed to create category', 500, error.message);
		}
	}

	// Update category
	static async update(req, res) {
		try {
			const { id } = req.params;
			const { CAT_NAME, CAT_DESC } = req.body;

			if (!CAT_NAME || CAT_NAME.trim() === '') {
				return ApiResponse.badRequest(res, 'Category name is required');
			}

			const user_id = req.session.user_id || req.user?.user_id;
			const updated = await CategoryModel.update(id, {
				CAT_NAME,
				CAT_DESC,
				user_id
			});

			if (!updated) {
				return ApiResponse.notFound(res, 'Category');
			}

			return ApiResponse.success(res, null, 'Category updated successfully');
		} catch (error) {
			console.error('Error updating category:', error);
			return ApiResponse.error(res, 'Failed to update category', 500, error.message);
		}
	}

	// Delete category
	static async delete(req, res) {
		try {
			const { id } = req.params;
			const user_id = req.session.user_id;

			const deleted = await CategoryModel.delete(id, user_id);

			if (!deleted) {
				return ApiResponse.notFound(res, 'Category');
			}

			return ApiResponse.success(res, null, 'Category deleted successfully');
		} catch (error) {
			console.error('Error deleting category:', error);
			return ApiResponse.error(res, 'Failed to delete category', 500, error.message);
		}
	}
}

module.exports = CategoryController;


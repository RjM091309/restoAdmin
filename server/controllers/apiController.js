// ============================================
// API CONTROLLER
// ============================================
// File: controllers/apiController.js
// Description: Public API endpoints for Android app
// ============================================

const MenuModel = require('../models/menuModel');
const CategoryModel = require('../models/categoryModel');
const OrderModel = require('../models/orderModel');
const OrderItemsModel = require('../models/orderItemsModel');
const BillingModel = require('../models/billingModel');
const TableModel = require('../models/tableModel');
const UserModel = require('../models/userModel');
const UserBranchModel = require('../models/userBranchModel');
const BranchModel = require('../models/branchModel');
const InventoryDeductionService = require('../services/inventoryDeductionService');
const argon2 = require('argon2');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const socketService = require('../utils/socketService');
const TranslationService = require('../utils/translationService');
const { isArgonHash, generateMD5 } = require('../utils/authUtils');

class ApiController {
	// Login endpoint for mobile app
	static async login(req, res) {
		const timestamp = new Date().toISOString();

		try {
			const { username, password } = req.body;

			if (!username || !password) {
				console.log(`[${timestamp}] [LOGIN FAILED] Missing credentials - Username: ${username || 'N/A'}`);
				return res.status(400).json({
					success: false,
					error: 'Username and password are required'
				});
			}

			const user = await UserModel.findByUsernameWithRole(username);

			if (user) {
				const storedPassword = user.PASSWORD;
				const salt = user.SALT;
				const userRole = user.role || null;

				let isValid = false;
				let isLegacy = false;

				if (isArgonHash(storedPassword)) {
					isValid = await argon2.verify(storedPassword, password);
				} else {
					const hashedMD5 = generateMD5(salt + password);
					isValid = (hashedMD5 === storedPassword);
					isLegacy = true;
				}

				if (isValid) {
					const allowedPermissions = [1, 2, 14, 15, 16]; 
					const userPermissions = parseInt(user.PERMISSIONS, 10);
					
					console.log(`[${timestamp}] [LOGIN CHECK] ${username} - PERMISSIONS: ${user.PERMISSIONS}, parsed: ${userPermissions}, allowed: [${allowedPermissions.join(', ')}]`);
					
					if (!allowedPermissions.includes(userPermissions)) {
						console.log(`[${timestamp}] [LOGIN FAILED] ${username} - Not an allowed mobile app user`);
						return res.status(403).json({
							success: false,
							error: 'This account is for web admin only. Please use the web application to login.'
						});
					}
					
					console.log(`[${timestamp}] [LOGIN PERMISSION CHECK PASSED] ${username} - PERMISSIONS: ${userPermissions}`);

					if (isLegacy) {
						const newHash = await argon2.hash(password);
						await UserModel.updatePassword(user.IDNo, newHash);
					}

					await UserModel.updateLastLogin(user.IDNo);

					console.log(`[${timestamp}] [LOGIN] ${username}`);

					let branches = [];
					try {
						if (user.PERMISSIONS === 1) {
							branches = await BranchModel.getAllActive();
						} else {
							branches = await UserBranchModel.getBranchesByUserId(user.IDNo);
						}
					} catch (branchError) {
						console.error(`[${timestamp}] [LOGIN] Error getting branches for user ${user.IDNo}:`, branchError);
						branches = [];
					}

					const tokenPayload = {
						user_id: user.IDNo,
						username: user.USERNAME,
						permissions: user.PERMISSIONS,
						firstname: user.FIRSTNAME,
						lastname: user.LASTNAME,
						branch_id: user.BRANCH_ID || null
					};
					const tokens = generateTokenPair(tokenPayload);

					return res.json({
						success: true,
						data: {
							user_id: user.IDNo,
							username: user.USERNAME,
							firstname: user.FIRSTNAME,
							lastname: user.LASTNAME,
							permissions: user.PERMISSIONS,
							branch_id: user.BRANCH_ID || null,
							role: userRole,
							table_id: user.TABLE_ID || null,
							branches: branches
						},
						tokens: {
							accessToken: tokens.accessToken,
							refreshToken: tokens.refreshToken,
							expiresIn: tokens.expiresIn
						}
					});
				} else {
					console.log(`[${timestamp}] [LOGIN FAILED] ${username}`);
					return res.status(401).json({
						success: false,
						error: 'Incorrect password'
					});
				}
			} else {
				console.log(`[${timestamp}] [LOGIN FAILED] ${username}`);
				return res.status(401).json({
					success: false,
					error: 'User not found or inactive'
				});
			}
		} catch (error) {
			console.error(`[${timestamp}] [LOGIN ERROR] ${req.body?.username || 'N/A'}`);
			return res.status(500).json({
				success: false,
				error: 'Internal server error'
			});
		}
	}

	static async getCategories(req, res) {
		const timestamp = new Date().toISOString();
		const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
		const targetLanguage = req.query.lang || req.query.language || 'en';

		try {
			const categories = await CategoryModel.getAll();
			let formattedCategories = categories.map(cat => ({
				id: cat.IDNo,
				name: cat.CAT_NAME,
				description: cat.CAT_DESC || null
			}));

			const translationAvailable = TranslationService.isAvailable();
			if (translationAvailable) {
				try {
					const descTextsToTranslate = [];
					const descTextMapping = [];
					formattedCategories.forEach(cat => {
						if (cat.description) {
							descTextsToTranslate.push(cat.description);
							descTextMapping.push({ cat: cat });
						}
					});
					if (descTextsToTranslate.length > 0) {
						const descTranslations = await TranslationService.translateBatch(descTextsToTranslate, targetLanguage);
						descTranslations.forEach((translation, index) => {
							if (descTextMapping[index]) {
								descTextMapping[index].cat.description = translation || descTextMapping[index].cat.description;
							}
						});
					}
				} catch (descError) {
					console.error(`[${timestamp}] [TRANSLATION ERROR] Failed to translate category descriptions:`, descError);
				}
				
				try {
					const textsToTranslate = [];
					const textMapping = [];
					formattedCategories.forEach(cat => {
						if (cat.name) {
							textsToTranslate.push(cat.name);
							textMapping.push({ type: 'name', cat: cat });
						}
					});
					if (textsToTranslate.length > 0) {
						const translations = await TranslationService.translateBatch(textsToTranslate, targetLanguage);
						translations.forEach((translation, index) => {
							const mapping = textMapping[index];
							if (mapping && mapping.type === 'name') {
								mapping.cat.name = translation || mapping.cat.name;
							}
						});
					}
				} catch (nameError) {
					console.error(`[${timestamp}] [TRANSLATION ERROR] Failed to translate category names:`, nameError);
				}
			}

			res.json({
				success: true,
				data: formattedCategories
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/categories - IP: ${clientIp}, Error:`, error);
			res.status(500).json({ 
				success: false,
				error: 'Failed to fetch categories' 
			});
		}
	}

	static async getTables(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;

		try {
			let resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (!resolvedBranchId && user_id) {
				const branches = await UserBranchModel.getBranchesByUserId(user_id);
				if (branches.length > 0) {
					resolvedBranchId = branches[0].IDNo;
				}
			}

			const tables = await TableModel.getAll(resolvedBranchId);
			const formattedTables = tables.map(table => ({
				id: table.IDNo,
				table_number: table.TABLE_NUMBER,
				capacity: table.CAPACITY,
				status: table.STATUS,
				branch_id: table.BRANCH_ID ?? null
			}));

			return res.json({
				success: true,
				data: formattedTables
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/tables - User ID: ${user_id}, Error:`, error);
			return res.status(500).json({
				success: false,
				error: 'Failed to fetch tables'
			});
		}
	}

	static async getMenuItems(req, res) {
		const timestamp = new Date().toISOString();
		const categoryId = req.query.category_id || null;
		const targetLanguage = req.query.lang || req.query.language || 'en';

		try {
			const branchId = req.query.branch_id || req.user?.branch_id || null;
			const menus = await MenuModel.getByCategory(categoryId, branchId);
			
			let baseUrl = req.protocol + '://' + req.get('host');
			if (req.get('x-forwarded-proto') === 'https' || req.get('host').includes('resto-admin.3core21.com')) {
				baseUrl = 'https://' + req.get('host');
			}
			let formattedMenus = menus.map(menu => ({
				id: menu.IDNo,
				category_id: menu.CATEGORY_ID,
				category_name: menu.CATEGORY_NAME || null,
				name: menu.MENU_NAME,
				description: menu.MENU_DESCRIPTION || null,
				image: menu.MENU_IMG ? baseUrl + menu.MENU_IMG : null,
				price: parseFloat(menu.MENU_PRICE || 0),
				is_available: (menu.EFFECTIVE_AVAILABLE ?? menu.IS_AVAILABLE) === 1,
				inventory_tracked: menu.INVENTORY_TRACKED === 1,
				inventory_available: menu.INVENTORY_AVAILABLE === 1,
				inventory_stock: menu.INVENTORY_STOCK !== null && menu.INVENTORY_STOCK !== undefined
					? parseFloat(menu.INVENTORY_STOCK)
					: null
			}));

			if (TranslationService.isAvailable()) {
				try {
					const descTextsToTranslate = [];
					const descTextMapping = [];
					formattedMenus.forEach(menu => {
						if (menu.description) {
							descTextsToTranslate.push(menu.description);
							descTextMapping.push({ menu: menu });
						}
					});
					if (descTextsToTranslate.length > 0) {
						const descTranslations = await TranslationService.translateBatch(descTextsToTranslate, targetLanguage);
						descTranslations.forEach((translation, index) => {
							if (descTextMapping[index]) {
								descTextMapping[index].menu.description = translation || descTextMapping[index].menu.description;
							}
						});
					}
				} catch (descError) {
					console.error(`[${timestamp}] [TRANSLATION ERROR] Failed to translate descriptions:`, descError);
				}
				
				try {
					const textsToTranslate = [];
					const textMapping = [];
					formattedMenus.forEach(menu => {
						if (menu.name) {
							textsToTranslate.push(menu.name);
							textMapping.push({ type: 'name', menu: menu });
						}
						if (menu.category_name) {
							textsToTranslate.push(menu.category_name);
							textMapping.push({ type: 'category', menu: menu });
						}
					});
					if (textsToTranslate.length > 0) {
						const translations = await TranslationService.translateBatch(textsToTranslate, targetLanguage);
						translations.forEach((translation, index) => {
							const mapping = textMapping[index];
							if (mapping) {
								if (mapping.type === 'name') {
									mapping.menu.name = translation || mapping.menu.name;
								} else if (mapping.type === 'category') {
									mapping.menu.category_name = translation || mapping.menu.category_name;
								}
							}
						});
					}
				} catch (nameError) {
					console.error(`[${timestamp}] [TRANSLATION ERROR] Failed to translate menu/category names:`, nameError);
				}
			}

			res.json({
				success: true,
				data: formattedMenus,
				count: formattedMenus.length
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/menu - Error:`, error);
			res.status(500).json({ 
				success: false,
				error: 'Failed to fetch menu items' 
			});
		}
	}

	static async refreshToken(req, res) {
		const timestamp = new Date().toISOString();
		try {
			const { refreshToken } = req.body;
			if (!refreshToken) {
				return res.status(400).json({ success: false, error: 'Refresh token is required' });
			}
			const decoded = verifyRefreshToken(refreshToken);
			const user = await UserModel.findById(decoded.user_id);

			if (!user) {
				return res.status(401).json({ success: false, error: 'User not found or inactive' });
			}

			const tokenPayload = {
				user_id: user.IDNo,
				username: user.USERNAME,
				permissions: user.PERMISSIONS
			};
			const tokens = generateTokenPair(tokenPayload);

			return res.json({
				success: true,
				tokens: {
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken,
					expiresIn: tokens.expiresIn
				}
			});
		} catch (error) {
			console.error(`[${timestamp}] [REFRESH ERROR] Error:`, error);
			if (error.message === 'Refresh token expired') {
				return res.status(401).json({ success: false, error: 'Refresh token expired', code: 'REFRESH_TOKEN_EXPIRED' });
			} else if (error.message === 'Invalid refresh token') {
				return res.status(401).json({ success: false, error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
			} else {
				return res.status(500).json({ success: false, error: 'Internal server error' });
			}
		}
	}

	static async getUserOrders(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;
		const table_id = req.query.table_id ? parseInt(req.query.table_id) : null;

		try {
			if (!user_id) {
				return res.status(400).json({ success: false, error: 'User ID is required' });
			}
			const branchId = req.query.branch_id || req.user?.branch_id || null;
			const orders = await OrderModel.getByUserIdOrTableId(user_id, table_id, branchId);

			const ordersWithItems = await Promise.all(
				orders.map(async (order) => {
					const items = await OrderItemsModel.getByOrderId(order.IDNo);
					return {
						order_id: order.IDNo,
						order_no: order.ORDER_NO,
						table_id: order.TABLE_ID,
						order_type: order.ORDER_TYPE,
						status: order.STATUS,
						subtotal: parseFloat(order.SUBTOTAL || 0),
						tax_amount: parseFloat(order.TAX_AMOUNT || 0),
						service_charge: parseFloat(order.SERVICE_CHARGE || 0),
						discount_amount: parseFloat(order.DISCOUNT_AMOUNT || 0),
						grand_total: parseFloat(order.GRAND_TOTAL || 0),
						encoded_dt: order.ENCODED_DT,
						items: items.map(item => ({
							menu_id: item.MENU_ID,
							menu_name: item.MENU_NAME,
							qty: parseFloat(item.QTY || 0),
							unit_price: parseFloat(item.UNIT_PRICE || 0),
							line_total: parseFloat(item.LINE_TOTAL || 0),
							status: item.STATUS
						}))
					};
				})
			);

			return res.json({
				success: true,
				data: ordersWithItems
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/orders - User ID: ${user_id}, Error:`, error);
			return res.status(500).json({
				success: false,
				error: 'Failed to fetch orders'
			});
		}
	}

	static async getKitchenOrders(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;

		try {
			if (!user_id) {
				return res.status(400).json({ success: false, error: 'User ID is required' });
			}
			const branchId = req.query.branch_id || req.user?.branch_id || null;
			const orders = await OrderModel.getKitchenOrders(branchId);

			const ordersWithItems = await Promise.all(
				orders.map(async (order) => {
					const items = await OrderItemsModel.getByOrderId(order.IDNo);
					let overallStatus = 1; 
					const hasPending = items.some(item => item.STATUS === 3);
					const hasPreparing = items.some(item => item.STATUS === 2);
					const allReady = items.every(item => item.STATUS === 1);
					
					if (hasPending) overallStatus = 3;
					else if (hasPreparing) overallStatus = 2;
					else if (allReady) overallStatus = 1;
					
					return {
						order_id: order.IDNo,
						order_no: order.ORDER_NO,
						table_id: order.TABLE_ID,
						table_number: order.TABLE_NUMBER || null,
						order_type: order.ORDER_TYPE,
						status: overallStatus,
						subtotal: parseFloat(order.SUBTOTAL || 0),
						tax_amount: parseFloat(order.TAX_AMOUNT || 0),
						service_charge: parseFloat(order.SERVICE_CHARGE || 0),
						discount_amount: parseFloat(order.DISCOUNT_AMOUNT || 0),
						grand_total: parseFloat(order.GRAND_TOTAL || 0),
						encoded_dt: order.ENCODED_DT,
						items: items.map(item => ({
							item_id: item.IDNo,
							menu_id: item.MENU_ID,
							menu_name: item.MENU_NAME,
							qty: parseFloat(item.QTY || 0),
							unit_price: parseFloat(item.UNIT_PRICE || 0),
							line_total: parseFloat(item.LINE_TOTAL || 0),
							status: item.STATUS
						}))
					};
				})
			);

			return res.json({
				success: true,
				data: ordersWithItems
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/kitchen/orders - User ID: ${user_id}, Error:`, error);
			return res.status(500).json({
				success: false,
				error: 'Failed to fetch kitchen orders'
			});
		}
	}

	static async updateKitchenOrderStatus(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;
		const { order_id } = req.params;
		const { status } = req.body || {};
		const allowedStatuses = [3, 2, 1];

		try {
			if (!user_id) {
				return res.status(400).json({ success: false, error: 'User ID is required' });
			}
			const targetStatus = parseInt(status, 10);
			if (isNaN(targetStatus) || !allowedStatuses.includes(targetStatus)) {
				return res.status(400).json({ success: false, error: 'Invalid status.' });
			}

			const order = await OrderModel.getById(order_id);
			if (!order) {
				return res.status(404).json({ success: false, error: 'Order not found' });
			}

			const resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (resolvedBranchId && order.BRANCH_ID && parseInt(order.BRANCH_ID) !== parseInt(resolvedBranchId)) {
				return res.status(403).json({ success: false, error: 'Order is not in your branch' });
			}

			const items = await OrderItemsModel.getByOrderId(order_id);
			if (items.length === 0) {
				return res.status(404).json({ success: false, error: 'Order has no items to update' });
			}

			await Promise.all(items.map(item => OrderItemsModel.updateStatus(item.IDNo, targetStatus, user_id)));

			if (targetStatus !== 1) {
				await OrderModel.updateStatus(order_id, targetStatus, user_id);
			}

			socketService.emitOrderUpdate(order_id, {
				order_id: parseInt(order_id, 10),
				order_no: order.ORDER_NO,
				table_id: order.TABLE_ID,
				order_type: order.ORDER_TYPE,
				status: targetStatus === 1 ? (order.STATUS || 2) : targetStatus,
				grand_total: parseFloat(order.GRAND_TOTAL || 0),
				items: items.map(item => ({ ...item, STATUS: targetStatus }))
			});

			return res.json({
				success: true,
				data: { order_id: parseInt(order_id, 10), status: targetStatus, items_updated: items.length }
			});
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] POST /api/kitchen/orders/${order_id}/status - Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to update order status' });
		}
	}

	static async getWaiterOrders(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;

		try {
			let resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (!resolvedBranchId && user_id) {
				const branches = await UserBranchModel.getBranchesByUserId(user_id);
				if (branches.length > 0) resolvedBranchId = branches[0].IDNo;
			}
			const orders = await OrderModel.getAll(resolvedBranchId);
			const activeOrders = orders.filter(order => [3, 2, 1].includes(order.STATUS));

			const ordersWithItems = await Promise.all(
				activeOrders.map(async (order) => {
					const items = await OrderItemsModel.getByOrderId(order.IDNo);
					return {
						order_id: order.IDNo,
						order_no: order.ORDER_NO,
						payment_method: order.payment_method || null,
						table_id: order.TABLE_ID,
						table_number: order.TABLE_NUMBER || null,
						order_type: order.ORDER_TYPE,
						status: order.STATUS,
						subtotal: parseFloat(order.SUBTOTAL || 0),
						tax_amount: parseFloat(order.TAX_AMOUNT || 0),
						service_charge: parseFloat(order.SERVICE_CHARGE || 0),
						discount_amount: parseFloat(order.DISCOUNT_AMOUNT || 0),
						grand_total: parseFloat(order.GRAND_TOTAL || 0),
						encoded_dt: order.ENCODED_DT,
						items: items.map(item => ({
							item_id: item.IDNo,
							menu_id: item.MENU_ID,
							menu_name: item.MENU_NAME,
							qty: parseFloat(item.QTY || 0),
							unit_price: parseFloat(item.UNIT_PRICE || 0),
							line_total: parseFloat(item.LINE_TOTAL || 0),
							status: item.STATUS
						}))
					};
				})
			);

			return res.json({ success: true, data: ordersWithItems });
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] GET /api/waiter/orders - User ID: ${user_id}, Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to fetch waiter orders' });
		}
	}

	static async updateWaiterOrderStatus(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;
		const { order_id } = req.params;
		const { status, payment_method } = req.body || {};
		const allowedStatuses = [3, 2, 1];

		try {
			if (!user_id) return res.status(400).json({ success: false, error: 'User ID is required' });
			const targetStatus = parseInt(status, 10);
			if (!allowedStatuses.includes(targetStatus)) return res.status(400).json({ success: false, error: 'Invalid status.' });

			const order = await OrderModel.getById(order_id);
			if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
			
			const resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (resolvedBranchId && order.BRANCH_ID && parseInt(order.BRANCH_ID) !== parseInt(resolvedBranchId)) {
				return res.status(403).json({ success: false, error: 'Order is not in your branch' });
			}

			if (targetStatus === 1) await InventoryDeductionService.settleOrderWithInventory(Number(order_id), user_id);
			else await OrderModel.updateStatus(order_id, targetStatus, user_id);

			const paymentMethod = payment_method || 'CASH';

			if (targetStatus === 1) {
				if (order.TABLE_ID) await TableModel.updateStatus(order.TABLE_ID, 1);
				const existingBilling = await BillingModel.getByOrderId(order_id);
				if (existingBilling) {
					await BillingModel.updateForOrder(order_id, { status: 1, amount_paid: order.GRAND_TOTAL, payment_method: paymentMethod });
				} else {
					await BillingModel.createForOrder({ branch_id: order.BRANCH_ID, order_id: order_id, payment_method: paymentMethod, amount_due: order.GRAND_TOTAL, amount_paid: order.GRAND_TOTAL, status: 1, user_id: user_id });
				}

				try {
					await BillingModel.recordTransaction({ order_id: order_id, payment_method: paymentMethod, amount_paid: order.GRAND_TOTAL, payment_ref: 'Settled via Cashier App', user_id: user_id });
				} catch (e) {
					console.error(`[${timestamp}] [TRANSACTION ERROR] ${e.message}`);
				}

				try {
					const ReportsModel = require('../models/reportsModel');
					await ReportsModel.syncOrderToSalesHourlySummary(order_id);
					await ReportsModel.syncOrderToSalesCategoryReport(order_id);
					await ReportsModel.syncOrderToProductSalesSummary(order_id);
				} catch (syncError) {
					console.error(`[${timestamp}] [SYNC ERROR] ${syncError.message}`);
				}
			}

			const orderItems = await OrderItemsModel.getByOrderId(order_id);
			socketService.emitOrderUpdate(order_id, {
				order_id: parseInt(order_id, 10),
				order_no: order.ORDER_NO,
				payment_method: targetStatus === 1 ? paymentMethod : null,
				table_id: order.TABLE_ID,
				order_type: order.ORDER_TYPE,
				status: targetStatus,
				grand_total: parseFloat(order.GRAND_TOTAL || 0),
				items: orderItems
			});

			return res.json({ success: true, data: { order_id: parseInt(order_id, 10), status: targetStatus } });
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] PATCH /api/waiter/orders/${order_id}/status - Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to update order status' });
		}
	}

	static async createOrder(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;

		try {
			const { branch_id, order_no, table_id, order_type, subtotal, tax_amount, service_charge, discount_amount, grand_total, items } = req.body;

			if (!order_no || order_no.trim() === '') return res.status(400).json({ success: false, error: 'Order number is required' });
			if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'At least one order item is required' });

			let resolvedBranchId = branch_id ? parseInt(branch_id) : null;
			if (!resolvedBranchId && table_id) {
				const table = await TableModel.getById(table_id);
				if (table?.BRANCH_ID) resolvedBranchId = parseInt(table.BRANCH_ID);
			}
			if (!resolvedBranchId && user_id) {
				const branches = await UserBranchModel.getBranchesByUserId(user_id);
				if (branches.length > 0) resolvedBranchId = parseInt(branches[0].IDNo);
			}
			if (!resolvedBranchId) return res.status(400).json({ success: false, error: 'Branch ID is required' });

			const orderData = {
				BRANCH_ID: resolvedBranchId,
				ORDER_NO: order_no.trim(),
				TABLE_ID: table_id || null,
				ORDER_TYPE: order_type || null,
				STATUS: 3, 
				SUBTOTAL: parseFloat(subtotal) || 0,
				TAX_AMOUNT: parseFloat(tax_amount) || 0,
				SERVICE_CHARGE: parseFloat(service_charge) || 0,
				DISCOUNT_AMOUNT: parseFloat(discount_amount) || 0,
				GRAND_TOTAL: parseFloat(grand_total) || 0,
				user_id: user_id
			};

			const orderId = await OrderModel.create(orderData);
			const newOrderItems = items.map(item => ({
				menu_id: parseInt(item.menu_id),
				qty: parseFloat(item.qty),
				unit_price: parseFloat(item.unit_price),
				line_total: parseFloat(item.qty) * parseFloat(item.unit_price),
				status: item.status || 3
			}));

			await OrderItemsModel.createForOrder(orderId, newOrderItems, user_id);
			await BillingModel.createForOrder({ branch_id: orderData.BRANCH_ID, order_id: orderId, amount_due: orderData.GRAND_TOTAL, amount_paid: 0, status: 3, user_id: user_id });

			if (orderData.TABLE_ID) await TableModel.updateStatus(orderData.TABLE_ID, 2);

			const orderItems = await OrderItemsModel.getByOrderId(orderId);
			socketService.emitOrderCreated(orderId, { order_id: orderId, order_no: orderData.ORDER_NO, table_id: orderData.TABLE_ID, status: orderData.STATUS, grand_total: orderData.GRAND_TOTAL, items: orderItems, items_count: items.length });

			return res.json({ success: true, data: { order_id: orderId, order_no: orderData.ORDER_NO, table_id: orderData.TABLE_ID, status: orderData.STATUS, grand_total: orderData.GRAND_TOTAL, items_count: items.length } });
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] POST /api/orders - Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to create order' });
		}
	}

	static async addItemsToOrder(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;
		const { order_id } = req.params;

		try {
			if (!order_id) return res.status(400).json({ success: false, error: 'Order ID is required' });

			const existingOrder = await OrderModel.getById(order_id);
			if (!existingOrder) return res.status(404).json({ success: false, error: 'Order not found' });
			
			const resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (resolvedBranchId && existingOrder.BRANCH_ID && parseInt(existingOrder.BRANCH_ID) !== parseInt(resolvedBranchId)) {
				return res.status(403).json({ success: false, error: 'Order is not in your branch' });
			}

			const { items } = req.body;
			if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'At least one order item is required' });

			const existingItems = await OrderItemsModel.getByOrderId(order_id);
			const newItemsTotal = items.reduce((sum, item) => sum + (parseFloat(item.qty) * parseFloat(item.unit_price)), 0);
			const existingItemsTotal = existingItems.reduce((sum, item) => sum + (parseFloat(item.LINE_TOTAL) || 0), 0);

			const orderItemsToAdd = items.map(item => ({
				menu_id: parseInt(item.menu_id),
				qty: parseFloat(item.qty),
				unit_price: parseFloat(item.unit_price),
				line_total: parseFloat(item.qty) * parseFloat(item.unit_price),
				status: item.status || 3
			}));

			await OrderItemsModel.createForOrder(order_id, orderItemsToAdd, user_id);

			const newSubtotal = Number((existingItemsTotal + newItemsTotal).toFixed(2));
			const newGrandTotal = Number((newSubtotal + (Number(existingOrder.TAX_AMOUNT) || 0) + (Number(existingOrder.SERVICE_CHARGE) || 0) - (Number(existingOrder.DISCOUNT_AMOUNT) || 0)).toFixed(2));

			await OrderModel.update(order_id, {
				TABLE_ID: existingOrder.TABLE_ID,
				ORDER_TYPE: existingOrder.ORDER_TYPE,
				STATUS: existingOrder.STATUS,
				SUBTOTAL: newSubtotal,
				TAX_AMOUNT: existingOrder.TAX_AMOUNT,
				SERVICE_CHARGE: existingOrder.SERVICE_CHARGE,
				DISCOUNT_AMOUNT: existingOrder.DISCOUNT_AMOUNT,
				GRAND_TOTAL: newGrandTotal,
				user_id: user_id
			});

			const existingBilling = await BillingModel.getByOrderId(order_id);
			if (existingBilling) await BillingModel.updateForOrder(order_id, { amount_due: newGrandTotal });

			const allOrderItems = await OrderItemsModel.getByOrderId(order_id);
			socketService.emitOrderItemsAdded(order_id, { order_id: parseInt(order_id), order_no: existingOrder.ORDER_NO, table_id: existingOrder.TABLE_ID, status: existingOrder.STATUS, grand_total: newGrandTotal, items: allOrderItems, items_added: items.length });

			return res.json({ success: true, data: { order_id: parseInt(order_id), order_no: existingOrder.ORDER_NO, items_added: items.length, new_subtotal: newSubtotal, new_grand_total: newGrandTotal } });
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] POST /api/orders/${order_id}/items - Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to add items to order' });
		}
	}

	static async replaceOrderItems(req, res) {
		const timestamp = new Date().toISOString();
		const user_id = req.user?.user_id;
		const { order_id } = req.params;

		try {
			if (!order_id) return res.status(400).json({ success: false, error: 'Order ID is required' });

			const existingOrder = await OrderModel.getById(order_id);
			if (!existingOrder) return res.status(404).json({ success: false, error: 'Order not found' });
			
			const resolvedBranchId = req.query.branch_id || req.user?.branch_id || null;
			if (resolvedBranchId && existingOrder.BRANCH_ID && parseInt(existingOrder.BRANCH_ID) !== parseInt(resolvedBranchId)) {
				return res.status(403).json({ success: false, error: 'Order is not in your branch' });
			}

			const { items } = req.body;
			if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'At least one order item is required' });

			const replacementItems = items.map(item => ({
				menu_id: parseInt(item.menu_id),
				qty: parseFloat(item.qty),
				unit_price: parseFloat(item.unit_price),
				line_total: parseFloat(item.qty) * parseFloat(item.unit_price),
				status: item.status || 3
			}));

			const newSubtotal = Number(replacementItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
			const newGrandTotal = Number((newSubtotal + (Number(existingOrder.TAX_AMOUNT) || 0) + (Number(existingOrder.SERVICE_CHARGE) || 0) - (Number(existingOrder.DISCOUNT_AMOUNT) || 0)).toFixed(2));

			await OrderItemsModel.replaceForOrder(order_id, replacementItems, user_id);
			await OrderModel.update(order_id, {
				TABLE_ID: existingOrder.TABLE_ID,
				ORDER_TYPE: existingOrder.ORDER_TYPE,
				STATUS: existingOrder.STATUS,
				SUBTOTAL: newSubtotal,
				TAX_AMOUNT: existingOrder.TAX_AMOUNT,
				SERVICE_CHARGE: existingOrder.SERVICE_CHARGE,
				DISCOUNT_AMOUNT: existingOrder.DISCOUNT_AMOUNT,
				GRAND_TOTAL: newGrandTotal,
				user_id: user_id
			});

			const existingBilling = await BillingModel.getByOrderId(order_id);
			if (existingBilling) await BillingModel.updateForOrder(order_id, { amount_due: newGrandTotal });

			const updatedItems = await OrderItemsModel.getByOrderId(order_id);
			socketService.emitOrderUpdate(order_id, { order_id: parseInt(order_id), order_no: existingOrder.ORDER_NO, table_id: existingOrder.TABLE_ID, status: existingOrder.STATUS, grand_total: newGrandTotal, items: updatedItems });

			return res.json({ success: true, data: { order_id: parseInt(order_id), order_no: existingOrder.ORDER_NO, items_count: replacementItems.length, new_grand_total: newGrandTotal } });
		} catch (error) {
			console.error(`[${timestamp}] [API ERROR] PUT /api/orders/${order_id}/items - Error:`, error);
			return res.status(500).json({ success: false, error: 'Failed to update order items' });
		}
	}

	static async getMe(req, res) {
		try {
			if (!req.user) return res.json({ success: true, data: null });
			const user = await UserModel.findByIdWithRole(req.user.user_id);
			if (!user) return res.json({ success: true, data: null });
			return res.json({ success: true, data: user });
		} catch (error) {
			console.error('getMe error:', error);
			return res.status(500).json({ success: false, error: 'Internal server error' });
		}
	}
}

module.exports = ApiController;

// ============================================
// LOYVERSE SERVICE
// ============================================
// File: utils/loyverseService.js
// Description: Service for syncing orders from Loyverse API to local database
// ============================================

const axios = require('axios');
const pool = require('../config/db');
const OrderModel = require('../models/orderModel');
const OrderItemsModel = require('../models/orderItemsModel');
const BillingModel = require('../models/billingModel');
const LoyverseSyncStateModel = require('../models/loyverseSyncStateModel');
const socketService = require('./socketService');
require('dotenv').config();

class LoyverseService {
	constructor() {
		this.baseURL = 'https://api.loyverse.com/v1.0';
		this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN || '';
		this.defaultBranchId = parseInt(process.env.LOYVERSE_DEFAULT_BRANCH_ID) || 1;
		this.syncInterval = parseInt(process.env.LOYVERSE_SYNC_INTERVAL) || 10000; // 30 seconds default
		this.autoSyncLimit = parseInt(process.env.LOYVERSE_AUTO_SYNC_LIMIT) || 500;
		this.syncSince = process.env.LOYVERSE_SYNC_SINCE || '';
		// Safety limits (0 = no limit). Useful when you have very large datasets.
		this.maxSyncReceipts = parseInt(process.env.LOYVERSE_SYNC_MAX_RECEIPTS) || 0;
		this.maxSyncPages = parseInt(process.env.LOYVERSE_SYNC_MAX_PAGES) || 0;
		this.isSyncing = false;
		this.lastSyncTime = null;
		this.syncStats = {
			totalFetched: 0,
			totalInserted: 0,
			totalUpdated: 0,
			totalErrors: 0,
			lastError: null
		};
	}

	/**
	 * Get authorization header for Loyverse API
	 */
	getAuthHeaders() {
		return {
			'Authorization': `Bearer ${this.accessToken}`,
			'Content-Type': 'application/json'
		};
	}

	parseReceiptUpdatedAt(receipt) {
		const raw = receipt?.updated_at || receipt?.receipt_date || receipt?.created_at || null;
		if (!raw) return null;
		const d = new Date(raw);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	/**
	 * Fetch receipt by receipt number from Loyverse API
	 */
	async fetchReceipt(receiptNumber) {
		try {
			const url = `${this.baseURL}/receipts/${receiptNumber}`;
			const response = await axios.get(url, {
				headers: this.getAuthHeaders()
			});
			return response.data;
		} catch (error) {
			if (error.response?.status === 404) {
				return null; // Receipt not found
			}
			throw new Error(`Failed to fetch receipt ${receiptNumber}: ${error.message}`);
		}
	}

	/**
	 * Fetch all receipts from Loyverse API with pagination
	 * @param {number} limit
	 * @param {string|null} cursor
	 * @param {{ created_at_min?: string|Date, created_at_max?: string|Date }} dateFilter - optional; ISO or Date for filtering by receipt creation
	 */
	async fetchReceipts(limit = 50, cursor = null, dateFilter = {}) {
		try {
			// Loyverse API limits can vary; keep it sane.
			const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 250));
			let url = `${this.baseURL}/receipts?limit=${safeLimit}`;
			if (cursor) url += `&cursor=${cursor}`;

			const toIso = (v) => {
				if (!v) return null;
				const d = v instanceof Date ? v : new Date(v);
				return Number.isNaN(d.getTime()) ? null : d.toISOString();
			};
			const min = toIso(dateFilter.created_at_min);
			const max = toIso(dateFilter.created_at_max);
			if (min) url += `&created_at_min=${encodeURIComponent(min)}`;
			if (max) url += `&created_at_max=${encodeURIComponent(max)}`;

			const response = await axios.get(url, {
				headers: this.getAuthHeaders(),
				timeout: 30000
			});

			return {
				receipts: response.data.receipts || [],
				cursor: response.data.cursor || null,
				hasMore: !!response.data.cursor
			};
		} catch (error) {
			const status = error?.response?.status;
			if (status === 401) {
				// Most common cause: invalid/expired access token or wrong value (e.g. using app secret instead of access token)
				throw new Error(
					'Failed to fetch receipts: Unauthorized (401). ' +
					'Check LOYVERSE_ACCESS_TOKEN in .env (must be an OAuth access_token with RECEIPTS_READ scope).'
				);
			}
			throw new Error(`Failed to fetch receipts: ${error.message}`);
		}
	}

	/**
	 * Find menu item by name or SKU in local database
	 */
	async findMenuItemByNameOrSku(itemName, sku, branchId) {
		try {
			// 1) Prefer exact SKU match when available and the menu table has a SKU column.
			//    This allows branch‑specific mappings even when names differ across branches.
			if (sku) {
				const skuQuery = `
					SELECT IDNo, MENU_NAME, MENU_PRICE, BRANCH_ID
					FROM menu
					WHERE ACTIVE = 1
					AND BRANCH_ID = ?
					AND SKU = ?
					LIMIT 1
				`;

				try {
					const [skuRows] = await pool.execute(skuQuery, [branchId, sku]);
					if (skuRows && skuRows.length > 0) {
						return skuRows[0];
					}
				} catch (err) {
					// If the SKU column does not exist yet, fall back silently to name-based matching.
					// This keeps backward compatibility for databases that haven't been migrated.
					if (!String(err.message || '').includes('Unknown column')) {
						console.error(`Error querying menu by SKU: ${err.message}`);
					}
				}
			}

			// 2) Fallback: Find by menu name (case-insensitive, partial match)
			const nameQuery = `
				SELECT IDNo, MENU_NAME, MENU_PRICE, BRANCH_ID
				FROM menu
				WHERE ACTIVE = 1 
				AND BRANCH_ID = ?
				AND (MENU_NAME = ? OR MENU_NAME LIKE ?)
				LIMIT 1
			`;

			const [rows] = await pool.execute(nameQuery, [branchId, itemName, `%${itemName}%`]);

			return rows[0] || null;
		} catch (error) {
			console.error(`Error finding menu item: ${error.message}`);
			return null;
		}
	}

	/**
	 * Map Loyverse receipt type to local ORDER_TYPE
	 */
	mapOrderType(receiptType, diningOption) {
		if (receiptType === 'REFUND') {
			return 'REFUND'; // Handle refunds separately
		}

		// Map dining option to order type
		if (diningOption) {
			const option = diningOption.toLowerCase();
			if (option.includes('dine') || option.includes('dining')) {
				return 'DINE_IN';
			} else if (option.includes('take') || option.includes('takeout')) {
				return 'TAKE_OUT';
			} else if (option.includes('delivery')) {
				return 'DELIVERY';
			}
		}

		// Default to DINE_IN if not specified
		return 'DINE_IN';
	}

	/**
	 * Map Loyverse payment type to local PAYMENT_METHOD
	 */
	mapPaymentMethod(paymentType) {
		const type = paymentType?.toUpperCase() || '';
		
		if (type.includes('CASH')) {
			return 'CASH';
		} else if (type.includes('CARD') || type.includes('WORLDPAY') || type.includes('NONINTEGRATED')) {
			return 'CARD';
		} else if (type.includes('GCASH')) {
			return 'GCASH';
		} else if (type.includes('MAYA')) {
			return 'MAYA';
		}

		return 'CASH'; // Default
	}

	/**
	 * Check if order already exists by ORDER_NO
	 */
	async orderExists(orderNo) {
		try {
			const query = `SELECT IDNo FROM orders WHERE ORDER_NO = ? LIMIT 1`;
			const [rows] = await pool.execute(query, [orderNo]);
			return rows.length > 0 ? rows[0].IDNo : null;
		} catch (error) {
			console.error(`Error checking if order exists: ${error.message}`);
			return null;
		}
	}

	/**
	 * Sync a single receipt from Loyverse to local database
	 * Adds lightweight logging of raw payload for debugging.
	 */
	async syncReceipt(receipt, branchId = null) {
		const connection = await pool.getConnection();
		
		try {
			await connection.beginTransaction();

			const targetBranchId = branchId || this.defaultBranchId;
			const receiptNumber = receipt.receipt_number;

			// Debug: log key fields from raw receipt so we can verify how data maps into DB
			console.log('[Loyverse Sync][RAW RECEIPT]', JSON.stringify({
				receipt_number: receipt.receipt_number,
				receipt_type: receipt.receipt_type,
				transaction_type: receipt.transaction_type,
				refund_for: receipt.refund_for,
				total_money: receipt.total_money,
				total_tax: receipt.total_tax,
				total_discount: receipt.total_discount,
				receipt_date: receipt.receipt_date,
				created_at: receipt.created_at,
			}));
			let orderNo;
			let existingOrderId;
			const receiptType = String(receipt.receipt_type || '').toUpperCase();
			const transactionType = receipt.transaction_type; // some payloads may use numeric transaction_type
			const isRefund =
				receiptType === 'REFUND' ||
				transactionType === 2 ||
				(receipt.total_money || 0) < 0;

			if (isRefund) {
				// Prefer linking to original order when refund_for is present
				const originalReceiptNumber = receipt.refund_for;
				if (originalReceiptNumber) {
					orderNo = `LOY-${originalReceiptNumber}`;
					existingOrderId = await this.orderExists(orderNo);
				}

				if (!existingOrderId) {
					// Fall back to matching by this refund receipt's own number (in case original receipt was not imported yet)
					orderNo = `LOY-${receiptNumber}`;
					existingOrderId = await this.orderExists(orderNo);
				}

				if (!existingOrderId) {
					console.warn(
						`[Loyverse Sync] Refund receipt ${receipt.receipt_number} could not be matched to an existing order (refund_for=${originalReceiptNumber || 'N/A'}). Creating stub order for refund tracking.`
					);

					// Create a lightweight stub order so refunds are never lost,
					// even if the original sale was outside the imported date range.
					const refundDt = new Date(receipt.receipt_date || receipt.created_at);
					const stubOrderNo = `LOY-R-${receiptNumber}`;
					const stubValues = [
						targetBranchId,
						stubOrderNo,
						null,
						'DINE_IN', // ORDER_TYPE: use allowed value; stub is for refund tracking only (ORDER_NO = LOY-R-...)
						1,
						0,
						0,
						0,
						0,
						0,
						0,
						refundDt
					];

					try {
						const [stubOrderResult] = await connection.execute(
							`INSERT INTO orders (
								BRANCH_ID,
								ORDER_NO,
								TABLE_ID,
								ORDER_TYPE,
								STATUS,
								SUBTOTAL,
								TAX_AMOUNT,
								SERVICE_CHARGE,
								DISCOUNT_AMOUNT,
								GRAND_TOTAL,
								ENCODED_BY,
								ENCODED_DT
							) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							stubValues
						);
						existingOrderId = stubOrderResult.insertId;
					} catch (stubErr) {
						const msg = String(stubErr.message || '');
						if (msg.includes("IDNo") && msg.includes("default")) {
							const [nextIdRows] = await connection.execute(
								`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM orders`
							);
							const nextId = Number(nextIdRows[0]?.nextId ?? nextIdRows[0]?.nextid ?? 1) || 1;
							await connection.execute(
								`INSERT INTO orders (
									IDNo,
									BRANCH_ID,
									ORDER_NO,
									TABLE_ID,
									ORDER_TYPE,
									STATUS,
									SUBTOTAL,
									TAX_AMOUNT,
									SERVICE_CHARGE,
									DISCOUNT_AMOUNT,
									GRAND_TOTAL,
									ENCODED_BY,
									ENCODED_DT
								) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
								[nextId, ...stubValues]
							);
							existingOrderId = nextId;
						} else {
							throw stubErr;
						}
					}
				}

				const refundResult = await this.syncRefundReceipt(receipt, existingOrderId, targetBranchId);
				await connection.commit();
				return refundResult;
			}

			// For regular sales receipts or other types
			orderNo = `LOY-${receiptNumber}`; // Prefix to identify Loyverse orders
			existingOrderId = await this.orderExists(orderNo);

			if (existingOrderId && receipt.cancelled_at) {
				// Handle cancellation
				await connection.execute(
					`UPDATE orders SET STATUS = -1 WHERE IDNo = ?`,
					[existingOrderId]
				);
				await connection.commit();
				return { action: 'cancelled', orderId: existingOrderId };
			}

			if (existingOrderId) {
				// Update existing order
				await connection.execute(
					`UPDATE orders SET 
						SUBTOTAL = ?,
						TAX_AMOUNT = ?,
						DISCOUNT_AMOUNT = ?,
						GRAND_TOTAL = ?,
						EDITED_DT = CURRENT_TIMESTAMP
					WHERE IDNo = ?`,
					[
						receipt.total_money - (receipt.total_tax || 0) - (receipt.total_discount || 0),
						receipt.total_tax || 0,
						receipt.total_discount || 0,
						receipt.total_money || 0,
						existingOrderId
					]
				);

				// Delete old order items and recreate
				await connection.execute(
					`DELETE FROM order_items WHERE ORDER_ID = ?`,
					[existingOrderId]
				);

				// Insert new order items
				if (receipt.line_items && receipt.line_items.length > 0) {
					await this.insertOrderItems(connection, existingOrderId, receipt.line_items, targetBranchId);
				}

				await connection.commit();
				return { action: 'updated', orderId: existingOrderId };
			}

			// Create new order
			const orderType = this.mapOrderType(receipt.receipt_type, receipt.dining_option);
			const subtotal = receipt.total_money - (receipt.total_tax || 0) - (receipt.total_discount || 0);

			const orderValues = [
				targetBranchId,
				orderNo,
				null, // TABLE_ID - not available from Loyverse
				orderType,
				1, // STATUS: 1=SETTLED (since it's already paid in Loyverse)
				subtotal,
				receipt.total_tax || 0,
				0, // SERVICE_CHARGE
				receipt.total_discount || 0,
				receipt.total_money || 0,
				0, // ENCODED_BY: System user
				new Date(receipt.receipt_date || receipt.created_at)
			];

			let orderId;
			try {
				const [orderResult] = await connection.execute(
					`INSERT INTO orders (
						BRANCH_ID,
						ORDER_NO,
						TABLE_ID,
						ORDER_TYPE,
						STATUS,
						SUBTOTAL,
						TAX_AMOUNT,
						SERVICE_CHARGE,
						DISCOUNT_AMOUNT,
						GRAND_TOTAL,
						ENCODED_BY,
						ENCODED_DT
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					orderValues
				);
				orderId = orderResult.insertId;
			} catch (orderInsertErr) {
				// Fallback when IDNo has no default/AUTO_INCREMENT (run server/migrations/fix_orders_idno_autoincrement.sql to fix schema)
				const msg = String(orderInsertErr.message || '');
				if (msg.includes("IDNo") && msg.includes("default")) {
					const [nextIdRows] = await connection.execute(
						`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM orders`
					);
					const nextId = Number(nextIdRows[0]?.nextId ?? nextIdRows[0]?.nextid ?? 1) || 1;
					await connection.execute(
						`INSERT INTO orders (
							IDNo,
							BRANCH_ID,
							ORDER_NO,
							TABLE_ID,
							ORDER_TYPE,
							STATUS,
							SUBTOTAL,
							TAX_AMOUNT,
							SERVICE_CHARGE,
							DISCOUNT_AMOUNT,
							GRAND_TOTAL,
							ENCODED_BY,
							ENCODED_DT
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[nextId, ...orderValues]
					);
					orderId = nextId;
				} else {
					throw orderInsertErr;
				}
			}

			// Insert order items
			if (receipt.line_items && receipt.line_items.length > 0) {
				await this.insertOrderItems(connection, orderId, receipt.line_items, targetBranchId);
			}

			// Create billing record
			if (receipt.payments && receipt.payments.length > 0) {
				const totalPaid = receipt.payments.reduce((sum, payment) => sum + (payment.money_amount || 0), 0);
				const paymentMethod = this.mapPaymentMethod(receipt.payments[0]?.type);
				const billingValues = [
					targetBranchId,
					orderId,
					paymentMethod,
					receipt.total_money || 0,
					totalPaid,
					1, // STATUS: 1=PAID
					0, // ENCODED_BY: System user
					new Date(receipt.receipt_date || receipt.created_at)
				];
				try {
					await connection.execute(
						`INSERT INTO billing (
							BRANCH_ID,
							ORDER_ID,
							PAYMENT_METHOD,
							AMOUNT_DUE,
							AMOUNT_PAID,
							STATUS,
							ENCODED_BY,
							ENCODED_DT
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						billingValues
					);
				} catch (billingErr) {
					const msg = String(billingErr.message || '');
					if (msg.includes("IDNo") && msg.includes("default")) {
						const [rows] = await connection.execute(
							`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM billing`
						);
						const nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
						await connection.execute(
							`INSERT INTO billing (
								IDNo,
								BRANCH_ID,
								ORDER_ID,
								PAYMENT_METHOD,
								AMOUNT_DUE,
								AMOUNT_PAID,
								STATUS,
								ENCODED_BY,
								ENCODED_DT
							) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							[nextId, ...billingValues]
						);
					} else {
						throw billingErr;
					}
				}
			}

			await connection.commit();
			return { action: 'created', orderId };

		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	/**
	 * Insert order items from Loyverse line items
	 */
	async insertOrderItems(connection, orderId, lineItems, branchId) {
		if (!lineItems || lineItems.length === 0) {
			return;
		}

		const itemsToInsert = [];

		for (const lineItem of lineItems) {
			const itemName = lineItem.item_name || '';
			const sku = lineItem.sku || '';
			const quantity = lineItem.quantity || 1;
			const price = lineItem.price || 0;
			const totalMoney = lineItem.total_money || (quantity * price);

			// Find or auto-create matching menu item scoped to this branch
			let menuItem = await this.findMenuItemByNameOrSku(itemName, sku, branchId);

			if (!menuItem) {
				try {
					// Auto-create a menu entry for this branch so we don't need manual DB edits
					const unitPrice = price || (quantity ? (totalMoney / quantity) : 0);
					const encodedDt = new Date();

					// Base params shared by both insert variants (with/without SKU column).
					// Use 0 as fallback CATEGORY_ID to satisfy NOT NULL constraints on some servers.
					const baseParams = [
						branchId,      // BRANCH_ID
						0,             // CATEGORY_ID (unknown, can be reassigned later; 0 = "Uncategorized")
						itemName,      // MENU_NAME
						null,          // MENU_DESCRIPTION
						null,          // MENU_IMG
						unitPrice,     // MENU_PRICE
						1,             // IS_AVAILABLE
						1,             // ACTIVE
						0,             // ENCODED_BY (system)
						encodedDt,     // ENCODED_DT
					];

					try {
						// Prefer insert that includes SKU column when it exists
						const [result] = await connection.execute(
							`INSERT INTO menu (
								BRANCH_ID,
								CATEGORY_ID,
								MENU_NAME,
								MENU_DESCRIPTION,
								MENU_IMG,
								MENU_PRICE,
								IS_AVAILABLE,
								ACTIVE,
								ENCODED_BY,
								ENCODED_DT,
								SKU
							) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							[...baseParams, sku || null]
						);
						const insertedId = result.insertId;
						menuItem = {
							IDNo: insertedId,
							MENU_NAME: itemName,
							MENU_PRICE: unitPrice,
							BRANCH_ID: branchId,
						};
						console.log(`[Loyverse Sync] Auto-created menu item "${itemName}" for branch ${branchId} with SKU ${sku || 'NULL'}`);
					} catch (err) {
						// If SKU column does not exist yet, retry without it to keep backward compatibility
						if (String(err.message || '').includes('Unknown column') && String(err.message || '').includes('SKU')) {
							const [resultFallback] = await connection.execute(
								`INSERT INTO menu (
									BRANCH_ID,
									CATEGORY_ID,
									MENU_NAME,
									MENU_DESCRIPTION,
									MENU_IMG,
									MENU_PRICE,
									IS_AVAILABLE,
									ACTIVE,
									ENCODED_BY,
									ENCODED_DT
								) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
								baseParams
							);
							const insertedId = resultFallback.insertId;
							menuItem = {
								IDNo: insertedId,
								MENU_NAME: itemName,
								MENU_PRICE: unitPrice,
								BRANCH_ID: branchId,
							};
							console.log(`[Loyverse Sync] Auto-created menu item "${itemName}" for branch ${branchId} (no SKU column)`);
						} else {
							throw err;
						}
					}
				} catch (createErr) {
					console.error(`[Loyverse Sync] Failed to auto-create menu item "${itemName}" (SKU: ${sku}):`, createErr.message);
				}
			}

			if (menuItem) {
				itemsToInsert.push([
					orderId,
					menuItem.IDNo,
					quantity,
					price,
					totalMoney,
					1, // STATUS: 1=READY (already completed in Loyverse)
					0, // ENCODED_BY: System user
					new Date()
				]);
			} else {
				// Log unmapped items for manual review
				console.warn(`[Loyverse Sync] Menu item not found: "${itemName}" (SKU: ${sku})`);
				
				// Optionally create a placeholder or skip
				// For now, we'll skip unmapped items
			}
		}

		if (itemsToInsert.length > 0) {
			try {
				await connection.query(
					`INSERT INTO order_items (
						ORDER_ID,
						MENU_ID,
						QTY,
						UNIT_PRICE,
						LINE_TOTAL,
						STATUS,
						ENCODED_BY,
						ENCODED_DT
					) VALUES ?`,
					[itemsToInsert]
				);
			} catch (orderItemsErr) {
				const msg = String(orderItemsErr.message || '');
				if (msg.includes("IDNo") && msg.includes("default")) {
					const [rows] = await connection.execute(
						`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM order_items`
					);
					let nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
					const rowsWithId = itemsToInsert.map((row) => [nextId++, ...row]);
					await connection.query(
						`INSERT INTO order_items (
							IDNo,
							ORDER_ID,
							MENU_ID,
							QTY,
							UNIT_PRICE,
							LINE_TOTAL,
							STATUS,
							ENCODED_BY,
							ENCODED_DT
						) VALUES ?`,
						[rowsWithId]
					);
				} else {
					throw orderItemsErr;
				}
			}
		}
	}

	/**
	 * Sync a refund receipt from Loyverse to local database
	 */
	async syncRefundReceipt(receipt, existingOrderId, branchId = null) {
		const targetBranchId = branchId || this.defaultBranchId;
		// Use Math.abs to ensure refund amount is always a positive number in our DB
		const refundAmount = Math.abs(receipt.total_money || 0); 
		const refundDt = new Date(receipt.receipt_date || receipt.created_at);
		const refundReason = receipt.receipt_type_reason || 'Loyverse Refund'; // Assuming a reason field

		// Debug: log raw refund mapping before writing to billing
		console.log('[Loyverse Sync][REFUND MAP]', JSON.stringify({
			existingOrderId,
			branchId: targetBranchId,
			receipt_number: receipt.receipt_number,
			refund_for: receipt.refund_for,
			total_money: receipt.total_money,
			refundAmount,
			refundDt,
			refundReason,
		}));

		if (!existingOrderId) {
			console.warn(`[Loyverse Sync] Skipping refund sync: Original order not found for receipt ${receipt.receipt_number}`);
			return { action: 'skipped', reason: 'order_not_found' };
		}

		try {
			// Update the billing record for the existing order
			await BillingModel.updateRefundForOrder(existingOrderId, refundAmount, refundDt, refundReason);
			return { action: 'refund_updated', orderId: existingOrderId };
		} catch (error) {
			console.error(`[Loyverse Sync] Error syncing refund for order ${existingOrderId}:`, error.message);
			throw error;
		}
	}

	/**
	 * Sync all new receipts from Loyverse
	 */
	async syncAllReceipts(branchId = null, limit = 50, options = {}) {
		if (this.isSyncing) {
			throw new Error('Sync already in progress');
		}

		this.isSyncing = true;
		this.syncStats = {
			totalFetched: 0,
			totalInserted: 0,
			totalUpdated: 0,
			totalErrors: 0,
			lastError: null,
			cancelled: false
		};

		const abortedCheck = options.abortedCheck || (() => false);

		try {
			let cursor = null;
			let hasMore = true;
			const targetBranchId = branchId || this.defaultBranchId;
			let pageCount = 0;

			const incremental =
				options.incremental === true ||
				options.incremental === 'true' ||
				options.realtime === true ||
				options.realtime === 'true';

			const maxReceipts =
				parseInt(options.maxReceipts) ||
				parseInt(options.max_receipts) ||
				this.maxSyncReceipts ||
				0;
			const maxPages =
				parseInt(options.maxPages) ||
				parseInt(options.max_pages) ||
				this.maxSyncPages ||
				0;

			const toIso = (v) => {
				if (v == null || v === '') return null;
				const d = v instanceof Date ? v : new Date(v);
				return Number.isNaN(d.getTime()) ? null : d.toISOString();
			};
			const dateFilter = {};
			if (options.created_at_min != null) dateFilter.created_at_min = toIso(options.created_at_min);
			if (options.created_at_max != null) dateFilter.created_at_max = toIso(options.created_at_max);

			const rawSince = options.since || options.from || options.start || null;
			const forcedSince = rawSince ? new Date(rawSince) : null;
			const validForcedSince = forcedSince && !Number.isNaN(forcedSince.getTime()) ? forcedSince : null;

			const envSince = this.syncSince ? new Date(this.syncSince) : null;
			const validEnvSince = envSince && !Number.isNaN(envSince.getTime()) ? envSince : null;

			const lastUpdatedAt = incremental
				? (validForcedSince || await LoyverseSyncStateModel.getLastUpdatedAt(targetBranchId) || validEnvSince)
				: null;
			let maxUpdatedAtSeen = lastUpdatedAt;

			while (hasMore) {
				if (abortedCheck()) {
					this.syncStats.cancelled = true;
					console.log('[Loyverse Sync] Sync cancelled by client (request aborted).');
					hasMore = false;
					break;
				}
				pageCount += 1;
				const result = await this.fetchReceipts(limit, cursor, dateFilter);
				const receipts = result.receipts || [];
				this.syncStats.totalFetched += receipts.length;

				let skippedOldInPage = 0;

				for (const receipt of receipts) {
					if (abortedCheck()) {
						this.syncStats.cancelled = true;
						console.log('[Loyverse Sync] Sync cancelled by client (request aborted).');
						hasMore = false;
						break;
					}
					try {
						const receiptUpdatedAt = this.parseReceiptUpdatedAt(receipt);
						if (receiptUpdatedAt && (!maxUpdatedAtSeen || receiptUpdatedAt > maxUpdatedAtSeen)) {
							maxUpdatedAtSeen = receiptUpdatedAt;
						}

						// Incremental mode: skip receipts we've already processed
						if (incremental && lastUpdatedAt && receiptUpdatedAt && receiptUpdatedAt <= lastUpdatedAt) {
							skippedOldInPage += 1;
							continue;
						}

						const syncResult = await this.syncReceipt(receipt, targetBranchId);
						
						if (syncResult.action === 'created') {
							this.syncStats.totalInserted++;
							// Broadcast to UI (best-effort)
							try {
								const orderItems = await OrderItemsModel.getByOrderId(syncResult.orderId);
								socketService.emitOrderCreated(syncResult.orderId, {
									order_id: syncResult.orderId,
									order_no: `LOY-${receipt.receipt_number}`,
									status: 1,
									grand_total: receipt.total_money || 0,
									items: orderItems,
									items_count: orderItems.length
								});
							} catch (_) {}
						} else if (syncResult.action === 'updated') {
							this.syncStats.totalUpdated++;
							try {
								const order = await OrderModel.getById(syncResult.orderId);
								const orderItems = await OrderItemsModel.getByOrderId(syncResult.orderId);
								socketService.emitOrderUpdate(syncResult.orderId, {
									...order,
									items: orderItems,
									items_count: orderItems.length
								});
							} catch (_) {}
						} else if (syncResult.action === 'cancelled') {
							try {
								const order = await OrderModel.getById(syncResult.orderId);
								socketService.emitOrderUpdate(syncResult.orderId, {
									...order,
									status: -1,
									STATUS: -1
								});
							} catch (_) {}
						} else if (syncResult.action === 'refund_updated') {
							this.syncStats.totalUpdated++;
							// Optionally emit a refund updated event here if needed for UI
							console.log(`[Loyverse Sync] Refund processed for order ${syncResult.orderId}`);
						}
					} catch (error) {
						this.syncStats.totalErrors++;
						this.syncStats.lastError = error.message;
						console.error(`[Loyverse Sync] Error syncing receipt ${receipt.receipt_number}:`, error.message);
					}
				}

				if (this.syncStats.cancelled) break;

				cursor = result.cursor;
				hasMore = result.hasMore;

				// In incremental mode, stop when a full page is older/equal to lastUpdatedAt.
				if (incremental && lastUpdatedAt && receipts.length > 0 && skippedOldInPage === receipts.length) {
					hasMore = false;
				}

				// Optional safety limits (0 = unlimited)
				if (maxPages > 0 && pageCount >= maxPages) break;
				if (maxReceipts > 0 && this.syncStats.totalFetched >= maxReceipts) break;
			}

			// Persist checkpoint for incremental realtime polling
			if (incremental) {
				// Only advance the checkpoint when we actually observed a timestamp (or already had one).
				// This avoids accidentally setting it to "now" when the API returns no receipts,
				// which would cause older receipts to be skipped forever.
				const checkpoint = maxUpdatedAtSeen || lastUpdatedAt;
				if (checkpoint) {
					await LoyverseSyncStateModel.setLastUpdatedAt(targetBranchId, checkpoint);
				}
			}

			// Extra progress info for clients
			this.syncStats.pageCount = pageCount;
			this.syncStats.hasMore = hasMore;

			this.lastSyncTime = new Date();
			return this.syncStats;

		} catch (error) {
			this.syncStats.lastError = error.message;
			throw error;
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Start automatic sync (polling)
	 */
	startAutoSync(branchId = null, interval = null) {
		const syncInterval = interval || this.syncInterval;

		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
		}

		console.log(`[Loyverse Sync] Connected successfully sa loyverse`);

		this.autoSyncInterval = setInterval(async () => {
			try {
				// If a sync is already running (manual or previous auto run), skip this tick quietly
				if (this.isSyncing) {
					return;
				}

				await this.syncAllReceipts(branchId, this.autoSyncLimit, { incremental: true });
				// console.log(`[Loyverse Sync] Auto-sync completed at ${new Date().toISOString()}`);
			} catch (error) {
				console.error(`[Loyverse Sync] Auto-sync error:`, error.message);
				// If token is invalid, stop auto-sync to avoid spamming logs / calls until fixed
				if (String(error?.message || '').includes('Unauthorized (401)')) {
					console.error('[Loyverse Sync] Stopping auto-sync due to 401. Fix LOYVERSE_ACCESS_TOKEN then restart auto-sync.');
					this.stopAutoSync();
				}
			}
		}, syncInterval);

		// Run initial sync
		this.syncAllReceipts(branchId, this.autoSyncLimit, { incremental: true }).catch(err => {
			console.error(`[Loyverse Sync] Initial sync error:`, err.message);
		});
	}

	/**
	 * Stop automatic sync
	 */
	stopAutoSync() {
		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = null;
			console.log('[Loyverse Sync] Auto-sync stopped');
		}
	}

	/**
	 * Get sync status (shape matches frontend: status.autoSync.running, status.lastSync)
	 */
	getSyncStatus() {
		return {
			isSyncing: this.isSyncing,
			lastSyncTime: this.lastSyncTime,
			stats: this.syncStats,
			autoSyncActive: !!this.autoSyncInterval,
			autoSync: {
				running: !!this.autoSyncInterval,
				intervalMs: this.syncInterval
			},
			lastSync: this.lastSyncTime ? this.lastSyncTime.toISOString() : null
		};
	}

	/**
	 * Full re-sync from Loyverse (e.g. after DB wipe).
	 * Resets checkpoint then syncs all receipts without incremental skip.
	 */
	async fullResync(branchId = null, limit = 50, options = {}) {
		await LoyverseSyncStateModel.resetLastUpdatedAt(branchId || this.defaultBranchId);
		const opts = { ...options, incremental: false };
		return this.syncAllReceipts(branchId, limit, opts);
	}

	/**
	 * Sync only receipts within a date range (does not reset checkpoint).
	 * Use e.g. created_at_min = Jan 1, created_at_max = now to sync "this year – today".
	 */
	async syncDateRange(branchId = null, limit = 50, options = {}) {
		const targetBranchId = branchId || this.defaultBranchId;
		const createdMin = options.created_at_min;
		const createdMax = options.created_at_max;

		// When recomputing a range, clear existing refunds in that date window first
		// so that multiple runs stay idempotent even though we accumulate per order.
		if (createdMin && createdMax) {
			try {
				await BillingModel.resetRefundsInRange(createdMin, createdMax, targetBranchId);
			} catch (err) {
				console.error('[Loyverse Sync] Failed to reset refunds in range:', err.message);
			}
		}

		const opts = { ...options, incremental: false };
		return this.syncAllReceipts(targetBranchId, limit, opts);
	}
}

// Export singleton instance
const loyverseService = new LoyverseService();

module.exports = loyverseService;


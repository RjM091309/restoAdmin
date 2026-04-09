// ============================================
// LOYVERSE SERVICE
// ============================================
// File: utils/loyverseService.js
// Description: Service for syncing orders from Loyverse API to local database
// ============================================

const path = require('path');
const axios = require('axios');
require('dotenv').config({
	path: path.resolve(__dirname, '..', '..', '.env.local'),
	override: true,
});
require('dotenv').config({ override: true });

const pool = require('../config/db');
const OrderModel = require('../models/orderModel');
const OrderItemsModel = require('../models/orderItemsModel');
const BillingModel = require('../models/billingModel');
const LoyverseSyncStateModel = require('../models/loyverseSyncStateModel');
const socketService = require('./socketService');

class LoyverseService {
	constructor() {
		this.baseURL = 'https://api.loyverse.com/v1.0';
		this.accessToken = process.env.LOYVERSE_ACCESS_TOKEN || '';
		this.defaultBranchId = 1;
		this._refreshDefaultBranchIdFromEnv();
		this.syncInterval = parseInt(process.env.LOYVERSE_SYNC_INTERVAL) || 10000; // ms; default 10s if env unset
		this.autoSyncLimit = parseInt(process.env.LOYVERSE_AUTO_SYNC_LIMIT) || 500;
		this.syncSince = process.env.LOYVERSE_SYNC_SINCE || '';
		// When true, syncing is append-only: existing imported orders are never updated/overwritten.
		// New receipts (including refunds) will be inserted as new rows only.
		this.appendOnly =
			process.env.LOYVERSE_APPEND_ONLY === '1' ||
			String(process.env.LOYVERSE_APPEND_ONLY || '').toLowerCase() === 'true';
		// Prevent noisy debug logs: remember which raw receipts we already logged (in-memory).
		// Only used for RAW RECEIPT debug line; does not affect syncing behavior.
		this.rawReceiptLogCache = new Map(); // key -> lastSeenMs
		this.rawReceiptLogTtlMs = parseInt(process.env.LOYVERSE_RAW_RECEIPT_LOG_TTL_MS, 10) || (24 * 60 * 60 * 1000); // 24h
		this.rawReceiptLogMax = parseInt(process.env.LOYVERSE_RAW_RECEIPT_LOG_MAX, 10) || 5000;
		// Safety limits (0 = no limit). Useful when you have very large datasets.
		this.maxSyncReceipts = parseInt(process.env.LOYVERSE_SYNC_MAX_RECEIPTS) || 0;
		this.maxSyncPages = parseInt(process.env.LOYVERSE_SYNC_MAX_PAGES) || 0;
		/** Optional ms pause before each receipts page after the first (reduces Loyverse 429 bursts). */
		this.syncPageDelayMs = Math.max(0, parseInt(process.env.LOYVERSE_SYNC_PAGE_DELAY_MS, 10) || 0);
		/** Stagger start of each branch in multi auto-sync so two merchants do not hammer API together. */
		this.autoSyncBranchStaggerMs = Math.max(0, parseInt(process.env.LOYVERSE_AUTO_SYNC_BRANCH_STAGGER_MS, 10) || 0);
		/** Branch IDs with an active syncAllReceipts run (different branches may sync in parallel). */
		this.syncingBranches = new Set();
		// Cancel signals for in-flight sync loops (per-branch).
		/** @type {Set<number>} */
		this.cancelSyncRequestedBranches = new Set();
		/** @type {Map<number, string>} */
		this.cancelSyncReasonByBranch = new Map();
		this.lastSyncTime = null;
		this.syncStats = {
			totalFetched: 0,
			totalInserted: 0,
			totalUpdated: 0,
			totalErrors: 0,
			lastError: null
		};
		/** @type {Map<number, string>} */
		this.branchAccessTokens = new Map();
		this._loadBranchAccessTokens();
		/** @type {Map<string, number|null>} variant unit cost cache (Items API) */
		this._variantUnitCostCache = new Map();
		/** @type {boolean|null} */
		this._orderItemsLineCostColumnCache = null;
		/** When auto-sync runs for multiple branches, listed here (for status). */
		this.autoSyncMultiBranchIds = null;
		/** @type {Map<number, NodeJS.Timeout>} per-branch auto-sync timers */
		this.autoSyncIntervalsByBranch = new Map();
		/** @type {Map<number, number>} per-branch cooldown until epoch ms (for 429 backoff) */
		this.rateLimitCooldownUntilMs = new Map();
		/** @type {Map<number, { created_at_min: string|null, created_at_max: string|null }>} active date-range sync context */
		this.activeDateRangeByBranch = new Map();
		/** @type {Map<number, { source: string, created_at_min: string|null, created_at_max: string|null, startedAt: string }>} */
		this.activeSyncMetaByBranch = new Map();
		/** @type {Map<number, Record<string, unknown>>} Per-branch live progress for /api/loyverse/status + UI bar */
		this.activeSyncProgressByBranch = new Map();
		const envRaw = process.env.LOYVERSE_DEFAULT_BRANCH_ID;
		const hasExplicitDefault = envRaw != null && String(envRaw).trim() !== '';
		const autoList = (process.env.LOYVERSE_AUTO_SYNC_BRANCH_IDS || '').trim();
		console.log(
			'[Loyverse] defaultBranchId=%s (LOYVERSE_DEFAULT_BRANCH_ID=%s%s)',
			this.defaultBranchId,
			hasExplicitDefault ? `"${String(envRaw).trim()}"` : 'unset',
			!hasExplicitDefault && autoList ? `; inferred first from LOYVERSE_AUTO_SYNC_BRANCH_IDS="${autoList}"` : ''
		);
		// LINE_COST: receipt fields + Items API (default on). Set LOYVERSE_FETCH_VARIANT_COST=0 to skip HTTP. Token may need ITEMS_READ.
	}


	/**
	 * First branch in LOYVERSE_AUTO_SYNC_BRANCH_IDS (e.g. "2,9") when DEFAULT is unset — avoids silent fallback to 1.
	 */
	_defaultBranchIdFromAutoSyncList() {
		const multiRaw = (process.env.LOYVERSE_AUTO_SYNC_BRANCH_IDS || '').trim();
		if (!multiRaw) return null;
		const ids = multiRaw
			.split(',')
			.map((s) => parseInt(String(s).trim(), 10))
			.filter((n) => Number.isFinite(n) && n > 0);
		return ids.length ? ids[0] : null;
	}

	/** Re-read from process.env before each sync so server config matches .env after deploy. */
	_refreshDefaultBranchIdFromEnv() {
		const raw = process.env.LOYVERSE_DEFAULT_BRANCH_ID;
		const trimmed = raw != null ? String(raw).trim() : '';
		if (trimmed) {
			const parsed = parseInt(trimmed, 10);
			this.defaultBranchId = Number.isFinite(parsed) ? parsed : (this._defaultBranchIdFromAutoSyncList() || 1);
			return;
		}
		const fromList = this._defaultBranchIdFromAutoSyncList();
		if (fromList != null) {
			this.defaultBranchId = fromList;
			return;
		}
		this.defaultBranchId = 1;
	}

	_touchSyncProgress(branchId, patch) {
		const bid = parseInt(branchId, 10);
		if (!Number.isFinite(bid)) return;
		const prev = this.activeSyncProgressByBranch.get(bid) || {};
		this.activeSyncProgressByBranch.set(bid, {
			...prev,
			...patch,
			updatedAt: new Date().toISOString(),
		});
	}

	/**
	 * Per-branch Loyverse OAuth tokens (different merchants / POS accounts).
	 * Sources: LOYVERSE_BRANCH_ACCOUNTS (JSON array) and LOYVERSE_BRANCH_<id>_ACCESS_TOKEN.
	 */
	_loadBranchAccessTokens() {
		this.branchAccessTokens = new Map();
		const jsonRaw = (process.env.LOYVERSE_BRANCH_ACCOUNTS || '').trim();
		if (jsonRaw) {
			try {
				const arr = JSON.parse(jsonRaw);
				if (Array.isArray(arr)) {
					for (const row of arr) {
						const bid = parseInt(row.branchId ?? row.branch_id, 10);
						const tok = row.accessToken ?? row.access_token ?? row.token ?? '';
						if (Number.isFinite(bid) && tok) {
							this.branchAccessTokens.set(bid, String(tok).trim());
						}
					}
				}
			} catch (e) {
				console.warn('[Loyverse] LOYVERSE_BRANCH_ACCOUNTS JSON parse failed:', e.message);
			}
		}
		const re = /^LOYVERSE_BRANCH_(\d+)_ACCESS_TOKEN$/;
		for (const key of Object.keys(process.env)) {
			const m = key.match(re);
			if (m) {
				const bid = parseInt(m[1], 10);
				const tok = process.env[key];
				if (tok && Number.isFinite(bid)) {
					this.branchAccessTokens.set(bid, String(tok).trim());
				}
			}
		}
	}

	/**
	 * OAuth token for API calls attributed to this app branch (DB BRANCH_ID).
	 */
	resolveAccessToken(branchId) {
		const id = parseInt(branchId, 10);
		if (Number.isFinite(id) && this.branchAccessTokens.has(id)) {
			return this.branchAccessTokens.get(id);
		}
		return this.accessToken || '';
	}

	/**
	 * Get authorization header for Loyverse API
	 * @param {number|null} [branchId] - when set, uses per-branch token if configured
	 */
	getAuthHeaders(branchId = null) {
		const token =
			branchId != null && branchId !== ''
				? this.resolveAccessToken(branchId)
				: this.accessToken;
		return {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		};
	}

	parseReceiptUpdatedAt(receipt) {
		const raw = receipt?.updated_at || receipt?.receipt_date || receipt?.created_at || null;
		if (!raw) return null;
		const d = new Date(raw);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	_makeRawReceiptLogKey(receipt) {
		const receiptNumber = receipt?.receipt_number || 'unknown';
		const stamp = receipt?.updated_at || receipt?.created_at || receipt?.receipt_date || '';
		const total = receipt?.total_money ?? '';
		const refundFor = receipt?.refund_for ?? '';
		return `${receiptNumber}|${stamp}|${total}|${refundFor}`;
	}

	_shouldLogRawReceipt(receipt) {
		const now = Date.now();
		const key = this._makeRawReceiptLogKey(receipt);
		const last = this.rawReceiptLogCache.get(key);

		if (last != null && (now - last) < this.rawReceiptLogTtlMs) {
			return false;
		}

		this.rawReceiptLogCache.set(key, now);

		// Lightweight cleanup to keep memory bounded
		if (this.rawReceiptLogCache.size > this.rawReceiptLogMax) {
			const minKeep = Math.floor(this.rawReceiptLogMax * 0.8);
			const entries = Array.from(this.rawReceiptLogCache.entries());
			entries.sort((a, b) => a[1] - b[1]); // oldest first
			for (let i = 0; i < entries.length - minKeep; i++) {
				this.rawReceiptLogCache.delete(entries[i][0]);
			}
		}

		return true;
	}

	/**
	 * Fetch receipt by receipt number from Loyverse API
	 */
	async fetchReceipt(receiptNumber, authBranchId = null) {
		try {
			const url = `${this.baseURL}/receipts/${receiptNumber}`;
			const bid = authBranchId != null ? authBranchId : this.defaultBranchId;
			const response = await axios.get(url, {
				headers: this.getAuthHeaders(bid)
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
	async fetchReceipts(limit = 50, cursor = null, dateFilter = {}, authBranchId = null) {
		const bid = authBranchId != null ? authBranchId : this.defaultBranchId;
		const now = Date.now();
		const cooldownUntil = this.rateLimitCooldownUntilMs.get(bid) || 0;
		if (cooldownUntil > now) {
			const waitMs = cooldownUntil - now;
			await new Promise((r) => setTimeout(r, Math.min(waitMs, 30000)));
		}

		const attemptFetch = async () => {
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
				headers: this.getAuthHeaders(bid),
				timeout: 30000
			});

			return {
				receipts: response.data.receipts || [],
				cursor: response.data.cursor || null,
				hasMore: !!response.data.cursor
			};
		};

		// Retry policy for 429: respect Retry-After if present, else exponential backoff.
		let lastErr = null;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				return await attemptFetch();
			} catch (error) {
				lastErr = error;
				const status = error?.response?.status;
				if (status === 429) {
					const ra = error?.response?.headers?.['retry-after'];
					const retryAfterSec = ra != null ? Number(ra) : NaN;
					const base = Number.isFinite(retryAfterSec) && retryAfterSec > 0
						? Math.floor(retryAfterSec * 1000)
						: (1000 * Math.pow(2, attempt));
					// jitter 0-500ms
					const waitMs = Math.min(60000, base + Math.floor(Math.random() * 500));
					this.rateLimitCooldownUntilMs.set(bid, Date.now() + waitMs);
					console.warn('[Loyverse Sync] Rate limited (429). Backing off.', { branchId: bid, waitMs, attempt: attempt + 1 });
					await new Promise((r) => setTimeout(r, waitMs));
					continue;
				}
				throw error;
			}
		}

		const error = lastErr;
		try {
			const status = error?.response?.status;
			if (status === 401) {
				const b = bid;
				throw new Error(
					'Failed to fetch receipts: Unauthorized (401). ' +
					'Check OAuth access_token with RECEIPTS_READ scope: LOYVERSE_ACCESS_TOKEN ' +
					`or per-branch LOYVERSE_BRANCH_${b}_ACCESS_TOKEN / LOYVERSE_BRANCH_ACCOUNTS.`
				);
			}
			if (status === 429) {
				throw new Error('Failed to fetch receipts: Rate limited (429). Please wait and try again.');
			}
			throw new Error(`Failed to fetch receipts: ${error.message}`);
		} catch (e) {
			throw e;
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
	 * Loyverse receipt totals for billing (analytics uses billing.AMOUNT_PAID with orders.DISCOUNT_AMOUNT).
	 * Uses total_money as source of truth when payment split sums disagree or payments are missing.
	 */
	_resolveLoyversePaymentTotals(receipt) {
		const totalMoney = Number(receipt.total_money) || 0;
		let totalPaid = 0;
		if (receipt.payments && receipt.payments.length > 0) {
			totalPaid = receipt.payments.reduce((sum, p) => sum + (Number(p.money_amount) || 0), 0);
		}
		if (Math.abs(totalPaid - totalMoney) > 0.02) {
			totalPaid = totalMoney;
		}
		const paymentMethod =
			receipt.payments && receipt.payments.length > 0
				? this.mapPaymentMethod(receipt.payments[0]?.type)
				: 'CASH';
		const encodedDt = new Date(receipt.receipt_date || receipt.created_at);
		return { totalMoney, totalPaid, paymentMethod, encodedDt };
	}

	/**
	 * Insert or update billing for a normal sale so Sales Analytics (billing-based) matches Loyverse.
	 */
	async _upsertBillingForLoyverseSale(connection, targetBranchId, orderId, receipt) {
		const { totalMoney, totalPaid, paymentMethod, encodedDt } = this._resolveLoyversePaymentTotals(receipt);
		const [rows] = await connection.execute(
			`SELECT IDNo FROM billing WHERE ORDER_ID = ? ORDER BY IDNo ASC LIMIT 1`,
			[orderId]
		);
		if (rows && rows.length > 0) {
			const billingId = rows[0].IDNo;
			await connection.execute(
				`UPDATE billing SET BRANCH_ID = ?, PAYMENT_METHOD = ?, AMOUNT_DUE = ?, AMOUNT_PAID = ?, STATUS = 1, ENCODED_DT = ? WHERE IDNo = ?`,
				[targetBranchId, paymentMethod, totalMoney, totalPaid, encodedDt, billingId]
			);
			return;
		}
		const billingValues = [targetBranchId, orderId, paymentMethod, totalMoney, totalPaid, 1, 0, encodedDt];
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
			if (msg.includes('IDNo') && msg.includes('default')) {
				const [r2] = await connection.execute(`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM billing`);
				const nextId = Number(r2[0]?.nextId ?? r2[0]?.nextid ?? 1) || 1;
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
			let orderNo;
			let existingOrderId;
			const receiptType = String(receipt.receipt_type || '').toUpperCase();
			const transactionType = receipt.transaction_type; // some payloads may use numeric transaction_type
			const isRefund =
				receiptType === 'REFUND' ||
				transactionType === 2 ||
				(receipt.total_money || 0) < 0;

			if (isRefund) {
				// Append-only mode: never mutate an existing sale order to apply refunds.
				// Instead, create a standalone refund order + billing row so reports change
				// without rewriting historical sales rows.
				if (this.appendOnly) {
					const refundAmountAbs = Math.abs(receipt.total_money || 0);
					const refundTotal = -refundAmountAbs; // negative to reduce revenue in billing/order sums
					const refundDt = new Date(receipt.receipt_date || receipt.created_at);

					const refundOrderNo = `LOY-R-${receiptNumber}`;
					const maybeExistingRefundOrderId = await this.orderExists(refundOrderNo);
					if (maybeExistingRefundOrderId) {
						await connection.commit();
						return { action: 'skipped_existing_refund', orderId: maybeExistingRefundOrderId };
					}

					const orderValues = [
						targetBranchId,
						refundOrderNo,
						null,
						'REFUND',
						1,
						refundTotal,
						0,
						0,
						0,
						refundTotal,
						0,
						refundDt
					];

					let refundOrderId;
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
						refundOrderId = orderResult.insertId;
					} catch (orderInsertErr) {
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
							refundOrderId = nextId;
						} else {
							throw orderInsertErr;
						}
					}

					const paymentMethod = this.mapPaymentMethod(receipt.payments?.[0]?.type);
					const billingValues = [
						targetBranchId,
						refundOrderId,
						paymentMethod,
						refundTotal,
						refundTotal,
						1,
						0,
						refundDt
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

					await connection.commit();
					return { action: 'refund_created', orderId: refundOrderId };
				}

				// Default mode: link refund to original sale when possible and update billing (mutates existing order's billing refund fields).
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

			// Debug: log raw receipt only when it's new to our DB (prevents spam on periodic sync)
			if (!existingOrderId && this._shouldLogRawReceipt(receipt)) {
				console.log('[Loyverse Sync][RAW RECEIPT]', JSON.stringify({
					branch_id: targetBranchId,
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
			}

			if (existingOrderId && receipt.cancelled_at) {
				// Handle cancellation
				if (this.appendOnly) {
					await connection.commit();
					return { action: 'skipped_existing_cancel', orderId: existingOrderId };
				}
				await connection.execute(
					`UPDATE orders SET STATUS = -1 WHERE IDNo = ?`,
					[existingOrderId]
				);
				await connection.execute(`UPDATE billing SET STATUS = 0 WHERE ORDER_ID = ?`, [existingOrderId]);
				await connection.commit();
				return { action: 'cancelled', orderId: existingOrderId };
			}

			if (existingOrderId) {
				if (this.appendOnly) {
					await connection.commit();
					return { action: 'skipped_existing', orderId: existingOrderId };
				}
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

				await this._upsertBillingForLoyverseSale(connection, targetBranchId, existingOrderId, receipt);

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

			await this._upsertBillingForLoyverseSale(connection, targetBranchId, orderId, receipt);

			await connection.commit();
			return { action: 'created', orderId };

		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	/** Loyverse receipt line: COGS line total from receipt (API uses cost_total / cost). Zero means "not set" — skip so recipe fallback can apply. */
	_extractLoyverseLineAmountFromReceipt(lineItem, quantity) {
		const q = Number(quantity) || 1;
		const positive = (v) => {
			const n = Number(v);
			return Number.isFinite(n) && n > 0 ? n : null;
		};
		const totalCandidates = [
			lineItem.cost_total,
			lineItem.total_cost,
			lineItem.total_cost_money,
			lineItem.line_cost,
			lineItem.line_total_cost,
			lineItem.net_cost,
			lineItem.gross_cost,
			lineItem.money_cost,
		];
		for (const c of totalCandidates) {
			const t = positive(c);
			if (t != null) return t;
		}
		const unitCandidates = [
			lineItem.cost,
			lineItem.cost_money,
			lineItem.cost_price,
			lineItem.item_cost,
			lineItem.variant_cost,
			lineItem.default_cost,
			lineItem.average_cost,
			lineItem.unit_cost,
			lineItem.purchase_price,
		];
		for (const u of unitCandidates) {
			const uc = positive(u);
			if (uc != null) return uc * q;
		}
		const v = lineItem.variant;
		if (v && typeof v === 'object') {
			const uc = positive(v.cost ?? v.cost_money ?? v.default_cost ?? v.average_cost);
			if (uc != null) return uc * q;
		}
		return null;
	}

	_pickVariantUnitCostFromItemPayload(item, variantId) {
		const variants = item?.variants || [];
		for (const v of variants) {
			const vid = v.variant_id ?? v.id;
			if (variantId && String(vid) !== String(variantId)) continue;
			const c = Number(v.cost ?? v.default_cost ?? v.average_cost);
			if (Number.isFinite(c) && c > 0) return c;
		}
		return null;
	}

	/**
	 * Items API fallback so LINE_COST matches Loyverse when receipt omits amounts. Default ON; set LOYVERSE_FETCH_VARIANT_COST=0 to disable.
	 * Token needs ITEMS_READ (and RECEIPTS_READ) where applicable.
	 */
	async _fetchVariantUnitCostFromItemsApi(lineItem, branchId) {
		const fetchOff =
			process.env.LOYVERSE_FETCH_VARIANT_COST === '0' ||
			String(process.env.LOYVERSE_FETCH_VARIANT_COST || '').toLowerCase() === 'false';
		if (fetchOff) return null;

		const variantId = lineItem.variant_id || lineItem.item_variant_id;
		const itemId = lineItem.item_id;
		const vCacheKey = variantId ? `v:${branchId}:${variantId}` : null;

		if (vCacheKey && this._variantUnitCostCache.has(vCacheKey)) {
			return this._variantUnitCostCache.get(vCacheKey);
		}

		const headers = this.getAuthHeaders(branchId);
		const timeout = 15000;
		const dbg = String(process.env.LOYVERSE_DEBUG_SYNC || '').toLowerCase() === '1';

		if (itemId) {
			try {
				const res = await axios.get(`${this.baseURL}/items/${itemId}`, { headers, timeout });
				const item = res.data?.item || res.data;
				const unit = this._pickVariantUnitCostFromItemPayload(item, variantId);
				if (unit != null) {
					if (vCacheKey) this._variantUnitCostCache.set(vCacheKey, unit);
					return unit;
				}
			} catch (e) {
				if (dbg) console.warn('[Loyverse] items GET by item_id failed:', itemId, e?.message || e);
			}
		}

		if (variantId) {
			try {
				const res = await axios.get(`${this.baseURL}/items`, {
					headers,
					timeout,
					params: { variant_ids: variantId },
				});
				const items = res.data?.items || [];
				for (const it of items) {
					const unit = this._pickVariantUnitCostFromItemPayload(it, variantId);
					if (unit != null) {
						this._variantUnitCostCache.set(`v:${branchId}:${variantId}`, unit);
						return unit;
					}
				}
			} catch (e) {
				if (dbg) console.warn('[Loyverse] items GET by variant_ids failed:', variantId, e?.message || e);
			}
		}

		return null;
	}

	async _resolveLoyverseLineCostTotal(lineItem, quantity, branchId) {
		const q = Number(quantity) || 1;
		const fromReceipt = this._extractLoyverseLineAmountFromReceipt(lineItem, q);
		if (fromReceipt != null) return fromReceipt;
		const unit = await this._fetchVariantUnitCostFromItemsApi(lineItem, branchId);
		if (unit != null) return unit * q;
		return null;
	}

	/**
	 * Only cache positive detection. Never cache "no column" — so after ALTER TABLE, next sync picks up LINE_COST.
	 */
	async _orderItemsHasLineCostColumn(connection) {
		if (this._orderItemsLineCostColumnCache === true) {
			return true;
		}
		try {
			const [rows] = await connection.execute(
				`SELECT 1 FROM information_schema.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'LINE_COST'
				 LIMIT 1`
			);
			if (rows.length > 0) {
				this._orderItemsLineCostColumnCache = true;
				return true;
			}
			return false;
		} catch (e) {
			return false;
		}
	}

	/** Call after migrations add LINE_COST so inserts use the column without full process restart. */
	invalidateLineCostColumnCache() {
		this._orderItemsLineCostColumnCache = null;
	}

	/**
	 * Insert order items from Loyverse line items
	 */
	async insertOrderItems(connection, orderId, lineItems, branchId) {
		if (!lineItems || lineItems.length === 0) {
			return;
		}

		const hasLineCostCol = await this._orderItemsHasLineCostColumn(connection);
		const itemsToInsert = [];

		for (const lineItem of lineItems) {
			const itemName = lineItem.item_name || '';
			const sku = lineItem.sku || '';
			const quantity = lineItem.quantity || 1;
			const price = lineItem.price || 0;
			const totalMoney = lineItem.total_money || (quantity * price);
			const rawLineCost = await this._resolveLoyverseLineCostTotal(lineItem, quantity, branchId);
			const lineCostTotal =
				rawLineCost != null && Number(rawLineCost) > 0 ? Number(rawLineCost) : null;

			// Find matching menu item scoped to this branch
			let menuItem = await this.findMenuItemByNameOrSku(itemName, sku, branchId);

			// IMPORTANT: Do not auto-create menu items from Loyverse.
			// Menu master data is managed by admins; Loyverse sync will skip unmapped items.

			if (menuItem) {
				if (hasLineCostCol) {
					itemsToInsert.push([
						orderId,
						menuItem.IDNo,
						quantity,
						price,
						totalMoney,
						lineCostTotal,
						1,
						0,
						new Date()
					]);
				} else {
					itemsToInsert.push([
						orderId,
						menuItem.IDNo,
						quantity,
						price,
						totalMoney,
						1,
						0,
						new Date()
					]);
				}
			} else {
				// Log unmapped items for manual review
				console.warn(`[Loyverse Sync] Menu item not found: "${itemName}" (SKU: ${sku})`);
				
				// Skip unmapped items
			}
		}

		if (itemsToInsert.length > 0) {
			const insertCols = hasLineCostCol
				? `INSERT INTO order_items (
						ORDER_ID,
						MENU_ID,
						QTY,
						UNIT_PRICE,
						LINE_TOTAL,
						LINE_COST,
						STATUS,
						ENCODED_BY,
						ENCODED_DT
					) VALUES ?`
				: `INSERT INTO order_items (
						ORDER_ID,
						MENU_ID,
						QTY,
						UNIT_PRICE,
						LINE_TOTAL,
						STATUS,
						ENCODED_BY,
						ENCODED_DT
					) VALUES ?`;
			try {
				await connection.query(insertCols, [itemsToInsert]);
			} catch (orderItemsErr) {
				const msg = String(orderItemsErr.message || '');
				if (msg.includes("IDNo") && msg.includes("default")) {
					const [rows] = await connection.execute(
						`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM order_items`
					);
					let nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
					const rowsWithId = itemsToInsert.map((row) => [nextId++, ...row]);
					const insertColsWithId = hasLineCostCol
						? `INSERT INTO order_items (
							IDNo,
							ORDER_ID,
							MENU_ID,
							QTY,
							UNIT_PRICE,
							LINE_TOTAL,
							LINE_COST,
							STATUS,
							ENCODED_BY,
							ENCODED_DT
						) VALUES ?`
						: `INSERT INTO order_items (
							IDNo,
							ORDER_ID,
							MENU_ID,
							QTY,
							UNIT_PRICE,
							LINE_TOTAL,
							STATUS,
							ENCODED_BY,
							ENCODED_DT
						) VALUES ?`;
					await connection.query(insertColsWithId, [rowsWithId]);
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
		const refundReceiptNumber = receipt.receipt_number || null;

		const debugSync = String(process.env.LOYVERSE_DEBUG_SYNC || '').toLowerCase() === '1' || String(process.env.LOYVERSE_DEBUG_SYNC || '').toLowerCase() === 'true';
		if (debugSync) {
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
		}

		if (!existingOrderId) {
			console.warn(`[Loyverse Sync] Skipping refund sync: Original order not found for receipt ${receipt.receipt_number}`);
			return { action: 'skipped', reason: 'order_not_found' };
		}

		try {
			const billingResult = await BillingModel.updateRefundForOrder(
				existingOrderId,
				refundAmount,
				refundDt,
				refundReason,
				refundReceiptNumber
			);
			if (billingResult === false) {
				return { action: 'skipped', reason: 'billing_order_missing' };
			}
			if (billingResult && billingResult.changed === false) {
				return { action: 'refund_unchanged', orderId: existingOrderId };
			}
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
		this._refreshDefaultBranchIdFromEnv();
		const rawBid = branchId != null ? parseInt(branchId, 10) : this.defaultBranchId;
		const resolvedBranchId = Number.isFinite(rawBid) ? rawBid : this.defaultBranchId;
		const toIsoOrNull = (v) => {
			if (v == null || v === '') return null;
			const d = v instanceof Date ? v : new Date(v);
			return Number.isNaN(d.getTime()) ? null : d.toISOString();
		};
		const hasDateRange = options.created_at_min != null || options.created_at_max != null;
		const isIncrementalMode =
			options.incremental === true ||
			options.incremental === 'true' ||
			options.realtime === true ||
			options.realtime === 'true';
		const inferredSource = hasDateRange ? 'date_range' : (isIncrementalMode ? 'auto_sync' : 'manual_sync');
		const syncSource = String(options.sync_source || inferredSource);

		if (this.syncingBranches.has(resolvedBranchId)) {
			console.log('[Loyverse Sync] Rejecting new sync request: sync already in progress for this branch.', {
				branchId: resolvedBranchId,
				limit,
				incremental: options.incremental ?? options.realtime ?? null,
				since: options.since ?? options.from ?? null,
				lastSyncTime: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
			});
			throw new Error('Sync already in progress for this branch');
		}

		this.syncingBranches.add(resolvedBranchId);
		this.activeSyncMetaByBranch.set(resolvedBranchId, {
			source: syncSource,
			created_at_min: toIsoOrNull(options.created_at_min),
			created_at_max: toIsoOrNull(options.created_at_max),
			startedAt: new Date().toISOString(),
		});
		// Reset cancel state at the start of a new run for this branch.
		this.cancelSyncRequestedBranches.delete(resolvedBranchId);
		this.cancelSyncReasonByBranch.delete(resolvedBranchId);
		const syncRunId = `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
		const startTs = Date.now();
		console.log('[Loyverse Sync] Sync started.', {
			syncRunId,
			branchId: resolvedBranchId,
			limit,
			incremental: options.incremental ?? options.realtime ?? null,
			created_at_min: options.created_at_min ?? null,
			created_at_max: options.created_at_max ?? null,
			appendOnly: this.appendOnly,
		});
		this.syncStats = {
			totalFetched: 0,
			totalInserted: 0,
			totalUpdated: 0,
			refundNewlyApplied: 0,
			totalErrors: 0,
			lastError: null,
			cancelled: false
		};

		this._touchSyncProgress(resolvedBranchId, {
			syncRunId,
			branchId: resolvedBranchId,
			source: syncSource,
			incremental: isIncrementalMode,
			phase: 'starting',
			page: 0,
			receiptsThisPage: 0,
			processedInPage: 0,
			totalFetched: 0,
			totalInserted: 0,
			totalUpdated: 0,
			hasMore: null,
			startedAt: new Date().toISOString(),
			elapsedMs: 0,
		});

		const abortedCheck = options.abortedCheck || (() => false);
		const shouldCancel = () =>
			abortedCheck() || this.cancelSyncRequestedBranches.has(resolvedBranchId);

		try {
			let cursor = null;
			let hasMore = true;
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
				? (validForcedSince || await LoyverseSyncStateModel.getLastUpdatedAt(resolvedBranchId) || validEnvSince)
				: null;
			let maxUpdatedAtSeen = lastUpdatedAt;

			const pageLogEnv = String(process.env.LOYVERSE_SYNC_PAGE_LOG || '').toLowerCase();
			const logEveryPage =
				!incremental ||
				pageLogEnv === '1' ||
				pageLogEnv === 'true' ||
				pageLogEnv === 'yes';
			const receiptProgressEveryRaw = parseInt(String(process.env.LOYVERSE_SYNC_RECEIPT_PROGRESS_EVERY || ''), 10);
			// Date-range resync: log every N receipts while processing a page (default 25). Set env to 0 to disable.
			const receiptProgressEvery = Number.isFinite(receiptProgressEveryRaw) && receiptProgressEveryRaw >= 0
				? receiptProgressEveryRaw
				: (!incremental ? 25 : 0);

			while (hasMore) {
				if (shouldCancel()) {
					this.syncStats.cancelled = true;
					console.log('[Loyverse Sync] Sync cancelled.', {
						by: abortedCheck() ? 'client_abort' : 'server_cancel',
						reason: this.cancelSyncReasonByBranch.get(resolvedBranchId) || null,
					});
					hasMore = false;
					break;
				}
				pageCount += 1;
				if (pageCount > 1 && this.syncPageDelayMs > 0) {
					if (shouldCancel()) {
						this.syncStats.cancelled = true;
						hasMore = false;
						break;
					}
					await new Promise((r) => setTimeout(r, this.syncPageDelayMs));
				}
				this._touchSyncProgress(resolvedBranchId, {
					phase: 'fetching_api',
					page: pageCount,
					receiptsThisPage: 0,
					processedInPage: 0,
					elapsedMs: Date.now() - startTs,
				});
				const fetchStarted = Date.now();
				const result = await this.fetchReceipts(limit, cursor, dateFilter, resolvedBranchId);
				const receipts = result.receipts || [];
				this.syncStats.totalFetched += receipts.length;

				this._touchSyncProgress(resolvedBranchId, {
					phase: 'processing_receipts',
					page: pageCount,
					receiptsThisPage: receipts.length,
					processedInPage: 0,
					hasMore: !!result.hasMore,
					totalFetched: this.syncStats.totalFetched,
					totalInserted: this.syncStats.totalInserted,
					totalUpdated: this.syncStats.totalUpdated,
					apiFetchMs: Date.now() - fetchStarted,
					elapsedMs: Date.now() - startTs,
				});

				if (logEveryPage) {
					console.log('[Loyverse Sync] page fetched (processing next)', {
						branchId: resolvedBranchId,
						syncRunId,
						page: pageCount,
						receiptsThisPage: receipts.length,
						apiFetchMs: Date.now() - fetchStarted,
						hasMoreAfterPage: !!result.hasMore,
					});
				}

				let skippedOldInPage = 0;
				let pageInserted = 0;
				let pageUpdated = 0;
				let pageRefundApplied = 0;

				let receiptIndex = 0;
				for (const receipt of receipts) {
					receiptIndex += 1;
					if (shouldCancel()) {
						this.syncStats.cancelled = true;
						console.log('[Loyverse Sync] Sync cancelled.', {
							by: abortedCheck() ? 'client_abort' : 'server_cancel',
							reason: this.cancelSyncReasonByBranch.get(resolvedBranchId) || null,
						});
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

						const syncResult = await this.syncReceipt(receipt, resolvedBranchId);
						
						if (syncResult.action === 'created') {
							this.syncStats.totalInserted++;
							pageInserted++;
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
						} else if (syncResult.action === 'refund_created') {
							this.syncStats.totalInserted++;
							pageInserted++;
						} else if (syncResult.action === 'updated') {
							this.syncStats.totalUpdated++;
							pageUpdated++;
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
						} else if (syncResult.action === 'refund_unchanged') {
							// Idempotent replay: refund receipt already in loyverse_refund_receipts
						} else if (syncResult.action === 'refund_updated') {
							this.syncStats.totalUpdated++;
							this.syncStats.refundNewlyApplied++;
							pageRefundApplied++;
							console.log(`[Loyverse Sync] Refund applied to billing — order ${syncResult.orderId}`);
						}
					} catch (error) {
						this.syncStats.totalErrors++;
						this.syncStats.lastError = error.message;
						console.error(`[Loyverse Sync] Error syncing receipt ${receipt.receipt_number}:`, error.message);
					}

					this._touchSyncProgress(resolvedBranchId, {
						processedInPage: receiptIndex,
						totalFetched: this.syncStats.totalFetched,
						totalInserted: this.syncStats.totalInserted,
						totalUpdated: this.syncStats.totalUpdated,
						totalErrors: this.syncStats.totalErrors,
						lastReceiptNumber: receipt.receipt_number,
						elapsedMs: Date.now() - startTs,
					});

					if (receiptProgressEvery > 0 && receiptIndex % receiptProgressEvery === 0) {
						console.log('[Loyverse Sync] receipt progress', {
							branchId: resolvedBranchId,
							syncRunId,
							page: pageCount,
							processedInPage: receiptIndex,
							ofInPage: receipts.length,
							receipt_number: receipt.receipt_number,
							elapsedMs: Date.now() - startTs,
						});
					}
				}

				// Heartbeat: date-range / full syncs are non-incremental — log every API page so operators see work (not only on inserts).
				// For incremental (auto-sync), set LOYVERSE_SYNC_PAGE_LOG=1 to log each page too.
				if (logEveryPage) {
					const elapsedMs = Date.now() - startTs;
					console.log('[Loyverse Sync] page progress', {
						branchId: resolvedBranchId,
						syncRunId,
						page: pageCount,
						receiptsThisPage: receipts.length,
						totalFetched: this.syncStats.totalFetched,
						insertedThisPage: pageInserted,
						updatedThisPage: pageUpdated,
						errors: this.syncStats.totalErrors,
						hasMore: !!result.hasMore,
						elapsedMs,
					});
				}

				const verbosePage =
					String(process.env.LOYVERSE_VERBOSE_SYNC || '').toLowerCase() === '1' ||
					String(process.env.LOYVERSE_VERBOSE_SYNC || '').toLowerCase() === 'true';
				// Only log when there is genuinely new data: new orders/refund rows, or new refund applied to billing.
				// Routine re-writes of existing sales (same receipt) are omitted unless LOYVERSE_VERBOSE_SYNC=1.
				if (pageInserted > 0 || pageRefundApplied > 0) {
					console.log(
						`[Loyverse Sync] DB changes | branch=${resolvedBranchId} page=${pageCount} | ` +
							`+${pageInserted} new orders, +${pageRefundApplied} refunds newly applied to billing | ` +
							`API receipts this page: ${receipts.length}, skipped (older than checkpoint): ${skippedOldInPage}`
					);
				} else if (verbosePage && pageUpdated > 0) {
					console.log(
						`[Loyverse Sync] DB rewrite (verbose) | branch=${resolvedBranchId} page=${pageCount} | ` +
							`+${pageUpdated} existing rows re-written | ` +
							`API receipts: ${receipts.length}, skipped old: ${skippedOldInPage}`
					);
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
					await LoyverseSyncStateModel.setLastUpdatedAt(resolvedBranchId, checkpoint);
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
			this.syncingBranches.delete(resolvedBranchId);
			this.activeDateRangeByBranch.delete(resolvedBranchId);
			this.activeSyncMetaByBranch.delete(resolvedBranchId);
			this.activeSyncProgressByBranch.delete(resolvedBranchId);
			// Clear cancel request for this branch after completing this run.
			this.cancelSyncRequestedBranches.delete(resolvedBranchId);
			this.cancelSyncReasonByBranch.delete(resolvedBranchId);
			const elapsedMs = Date.now() - startTs;
			const ins = this.syncStats.totalInserted || 0;
			const upd = this.syncStats.totalUpdated || 0;
			const refNew = this.syncStats.refundNewlyApplied || 0;
			const fetched = this.syncStats.totalFetched || 0;
			const verbose =
				String(process.env.LOYVERSE_VERBOSE_SYNC || '').toLowerCase() === '1' ||
				String(process.env.LOYVERSE_VERBOSE_SYNC || '').toLowerCase() === 'true';
			if (ins > 0 || refNew > 0) {
				console.log(
					`[Loyverse Sync] ✅ Run complete — branch ${resolvedBranchId}: +${ins} new orders, +${refNew} refunds newly applied to billing | ` +
						`fetched=${fetched} from API | ${elapsedMs}ms`
				);
			} else if (verbose && upd > 0) {
				console.log(
					`[Loyverse Sync] Run complete (verbose) — branch ${resolvedBranchId}: +${upd} rows re-written (no new orders/refunds) | ` +
						`fetched=${fetched} | ${elapsedMs}ms`
				);
			}
			console.log('[Loyverse Sync] Sync finished.', {
				syncRunId,
				elapsedMs,
				stats: this.syncStats,
				lastSyncTime: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
			});
		}
	}

	/**
	 * Start automatic sync (polling)
	 */
	startAutoSync(branchId = null, interval = null) {
		const syncInterval = interval || this.syncInterval;

		// Track which branch auto-sync is targeting (even single-branch), so UI/status can show it.
		const rawBid = branchId != null ? parseInt(branchId, 10) : this.defaultBranchId;
		const bid = Number.isFinite(rawBid) ? rawBid : this.defaultBranchId;
		this.autoSyncMultiBranchIds = [bid];

		console.log(`[Loyverse Sync] Connected successfully sa loyverse`);

		// Replace existing timer for this branch only.
		const existing = this.autoSyncIntervalsByBranch.get(bid);
		if (existing) clearInterval(existing);

		const timer = setInterval(async () => {
			try {
				const now = Date.now();
				const cooldownUntil = this.rateLimitCooldownUntilMs.get(bid) || 0;
				if (cooldownUntil > now) return;
				if (this.syncingBranches.has(bid)) {
					return;
				}

				await this.syncAllReceipts(bid, this.autoSyncLimit, { incremental: true });
				// console.log(`[Loyverse Sync] Auto-sync completed at ${new Date().toISOString()}`);
			} catch (error) {
				console.error(`[Loyverse Sync] Auto-sync error:`, error.message);
				// If token is invalid, stop auto-sync to avoid spamming logs / calls until fixed
				if (String(error?.message || '').includes('Unauthorized (401)')) {
					console.error('[Loyverse Sync] Stopping auto-sync due to 401. Fix LOYVERSE_ACCESS_TOKEN (or per-branch token) then restart auto-sync.');
					this.stopAutoSync();
				}
			}
		}, syncInterval);
		this.autoSyncIntervalsByBranch.set(bid, timer);

		// Run initial sync
		this.syncAllReceipts(bid, this.autoSyncLimit, { incremental: true }).catch(err => {
			console.error(`[Loyverse Sync] Initial sync error:`, err.message);
		});
	}

	/**
	 * Poll Loyverse for each branch in order (separate merchant tokens per branch).
	 * @param {number[]} branchIds
	 * @param {number|null} interval
	 */
	startAutoSyncMulti(branchIds, interval = null) {
		const ids = (branchIds || []).filter((n) => Number.isFinite(parseInt(n, 10))).map((n) => parseInt(n, 10));
		if (!ids.length) {
			console.warn('[Loyverse Sync] startAutoSyncMulti: empty branch list; using startAutoSync(default).');
			return this.startAutoSync(null, interval);
		}

		const syncInterval = interval || this.syncInterval;
		this.autoSyncMultiBranchIds = [...ids];

		console.log(`[Loyverse Sync] Auto-sync (multi-branch): ${ids.join(', ')}`, {
			branchStaggerMs: this.autoSyncBranchStaggerMs,
		});

		// Start/replace timers per branch; optional stagger so branches do not sync at the same instant (429).
		for (let idx = 0; idx < ids.length; idx++) {
			const bid = ids[idx];
			const startBranch = () => {
				const existing = this.autoSyncIntervalsByBranch.get(bid);
				if (existing) clearInterval(existing);
				const timer = setInterval(async () => {
					try {
						const now = Date.now();
						const cooldownUntil = this.rateLimitCooldownUntilMs.get(bid) || 0;
						if (cooldownUntil > now) return;
						if (this.syncingBranches.has(bid)) return;
						await this.syncAllReceipts(bid, this.autoSyncLimit, { incremental: true });
					} catch (error) {
						console.error(`[Loyverse Sync] Auto-sync error (branch ${bid}):`, error.message);
						if (String(error?.message || '').includes('Unauthorized (401)')) {
							console.error(
								`[Loyverse Sync] Branch ${bid}: check LOYVERSE_BRANCH_${bid}_ACCESS_TOKEN or LOYVERSE_BRANCH_ACCOUNTS.`
							);
						}
					}
				}, syncInterval);
				this.autoSyncIntervalsByBranch.set(bid, timer);
				this.syncAllReceipts(bid, this.autoSyncLimit, { incremental: true }).catch((err) => {
					console.error(`[Loyverse Sync] Initial sync error (branch ${bid}):`, err.message);
				});
			};
			const delayMs = idx * this.autoSyncBranchStaggerMs;
			if (delayMs > 0) {
				setTimeout(startBranch, delayMs);
			} else {
				startBranch();
			}
		}
	}

	/**
	 * Stop automatic sync
	 */
	stopAutoSync(branchId = null) {
		// Stop a specific branch if provided; otherwise stop all branches.
		const ids = [];
		if (branchId != null) {
			const n = parseInt(branchId, 10);
			if (Number.isFinite(n)) ids.push(n);
		} else {
			ids.push(...Array.from(this.autoSyncIntervalsByBranch.keys()));
		}

		for (const bid of ids) {
			const timer = this.autoSyncIntervalsByBranch.get(bid);
			if (timer) {
				clearInterval(timer);
				this.autoSyncIntervalsByBranch.delete(bid);
			}
			if (this.syncingBranches.has(bid)) {
				this.cancelSyncRequestedBranches.add(bid);
				this.cancelSyncReasonByBranch.set(bid, 'auto_sync_stopped');
				console.log('[Loyverse Sync] Cancel requested for in-flight sync due to stopAutoSync().', { branchId: bid });
			}
		}

		// Update status fields
		this.autoSyncMultiBranchIds = this.autoSyncIntervalsByBranch.size
			? Array.from(this.autoSyncIntervalsByBranch.keys())
			: null;
		console.log('[Loyverse Sync] Auto-sync stopped', branchId != null ? { branchId: parseInt(branchId, 10) } : { all: true });
	}

	/**
	 * Get sync status (shape matches frontend: status.autoSync.running, status.lastSync)
	 */
	getSyncStatus() {
		const autoBranches = this.autoSyncIntervalsByBranch.size
			? Array.from(this.autoSyncIntervalsByBranch.keys())
			: (this.autoSyncMultiBranchIds || null);
		const activeDateRangeByBranch = Object.fromEntries(
			Array.from(this.activeDateRangeByBranch.entries()).map(([bid, range]) => [String(bid), range])
		);
		const activeSyncMetaByBranch = Object.fromEntries(
			Array.from(this.activeSyncMetaByBranch.entries()).map(([bid, meta]) => [String(bid), meta])
		);
		const syncProgressByBranch = Object.fromEntries(
			Array.from(this.activeSyncProgressByBranch.entries()).map(([bid, prog]) => [String(bid), prog])
		);
		return {
			isSyncing: this.syncingBranches.size > 0,
			syncingBranches: Array.from(this.syncingBranches),
			activeDateRangeByBranch,
			activeSyncMetaByBranch,
			syncProgressByBranch,
			lastSyncTime: this.lastSyncTime,
			stats: this.syncStats,
			autoSyncActive: this.autoSyncIntervalsByBranch.size > 0,
			autoSync: {
				running: this.autoSyncIntervalsByBranch.size > 0,
				intervalMs: this.syncInterval,
				branchIds: autoBranches
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
		const toIsoOrNull = (v) => {
			if (v == null || v === '') return null;
			const d = v instanceof Date ? v : new Date(v);
			return Number.isNaN(d.getTime()) ? null : d.toISOString();
		};
		this.activeDateRangeByBranch.set(targetBranchId, {
			created_at_min: toIsoOrNull(createdMin),
			created_at_max: toIsoOrNull(createdMax),
		});

		console.log('[Loyverse Sync] Date-range resync: preparing branch', {
			branchId: targetBranchId,
			limit,
			created_at_min: createdMin,
			created_at_max: createdMax,
		});

		// When recomputing a range, clear existing refunds in that date window first
		// so that multiple runs stay idempotent even though we accumulate per order.
		if (createdMin && createdMax) {
			const t0 = Date.now();
			try {
				console.log('[Loyverse Sync] Date-range resync: resetting refunds in range (DB)…');
				await BillingModel.resetRefundsInRange(createdMin, createdMax, targetBranchId);
				console.log('[Loyverse Sync] Date-range resync: refund reset done', {
					branchId: targetBranchId,
					ms: Date.now() - t0,
				});
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


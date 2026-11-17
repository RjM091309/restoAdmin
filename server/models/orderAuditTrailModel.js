// ============================================
// ORDER AUDIT TRAIL MODEL
// ============================================
// Sensitive corrections made to orders from the web admin — encoded date
// changes and soft deletes — one row per action (table order_audit_trail).
// Shown to the 3coredev account only, in User Management → Audit Trail.
//
// Separate from order_activity_logs (the cashier tablets' Activity tab) so
// these entries never show up on the tablets.
//
// ENCODED_DT values in DETAILS are stored exactly as the orders table holds
// them, so "from" and "to" are always comparable. Recording never throws: a
// logging failure must not fail the order action itself.
// ============================================

const pool = require('../config/db');
const { phLocalDtSql } = require('../utils/businessDay');
const { phLocalDayRangeFilter } = require('../utils/phDateRange');

const ACTIONS = ['encoded_dt_updated', 'soft_deleted'];

let schemaPromise = null;

function ensureSchema() {
	if (!schemaPromise) {
		schemaPromise = pool
			.query(`
				CREATE TABLE IF NOT EXISTS order_audit_trail (
					IDNo INT NOT NULL AUTO_INCREMENT,
					BRANCH_ID INT NULL,
					ORDER_ID INT NULL,
					ORDER_NO VARCHAR(64) NULL,
					ACTION VARCHAR(32) NOT NULL,
					SUMMARY VARCHAR(255) NOT NULL,
					DETAILS TEXT NULL,
					AMOUNT DECIMAL(12,2) NULL,
					USER_ID INT NULL,
					USERNAME VARCHAR(100) NULL,
					USER_ROLE VARCHAR(50) NULL,
					IS_ADMIN TINYINT(1) NOT NULL DEFAULT 0,
					CREATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (IDNo),
					KEY idx_oat_dt (CREATED_DT),
					KEY idx_oat_branch_dt (BRANCH_ID, CREATED_DT),
					KEY idx_oat_order (ORDER_ID)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
			`)
			.catch((err) => {
				schemaPromise = null;
				throw err;
			});
	}
	return schemaPromise;
}

const ORDER_STATUS_LABELS = { 3: 'Pending', 2: 'Confirmed', 1: 'Settled', '-1': 'Cancelled', '-2': 'Deleted' };
const statusLabel = (s) => ORDER_STATUS_LABELS[String(Number(s))] || `Status ${s}`;

class OrderAuditTrailModel {
	static get ACTIONS() {
		return ACTIONS;
	}

	static statusLabel(s) {
		return statusLabel(s);
	}

	/**
	 * The order as it is right now, with ENCODED_DT as the raw stored
	 * 'YYYY-MM-DD HH:MM:SS' (what an encoded-date update writes back).
	 */
	static async snapshot(orderId) {
		const [[row]] = await pool.query(
			`SELECT o.IDNo, o.BRANCH_ID, o.ORDER_NO, o.STATUS, o.GRAND_TOTAL, o.ORDER_TYPE,
					DATE_FORMAT(o.ENCODED_DT, '%Y-%m-%d %H:%i:%s') AS ENCODED_DT,
					(SELECT b.PAYMENT_METHOD FROM billing b WHERE b.ORDER_ID = o.IDNo ORDER BY b.IDNo DESC LIMIT 1) AS PAYMENT_METHOD
			 FROM orders o WHERE o.IDNo = ?`,
			[orderId]
		);
		return row || null;
	}

	/**
	 * Records one action. `order` is a snapshot() taken before the change.
	 */
	static async record(req, { action, order, summary, details = null }) {
		try {
			if (!order) return;
			await ensureSchema();
			const userId = req.user?.user_id ?? req.session?.user_id ?? null;
			let role = null;
			if (userId) {
				const [[u]] = await pool.query(
					`SELECT r.ROLE FROM user_info u LEFT JOIN user_role r ON r.IDNo = u.PERMISSIONS WHERE u.IDNo = ?`,
					[userId]
				);
				role = u?.ROLE || null;
			}
			const isAdmin = Number(req.user?.permissions ?? req.session?.permissions) === 1;
			await pool.query(
				`INSERT INTO order_audit_trail
					(BRANCH_ID, ORDER_ID, ORDER_NO, ACTION, SUMMARY, DETAILS, AMOUNT, USER_ID, USERNAME, USER_ROLE, IS_ADMIN)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					order.BRANCH_ID || null,
					order.IDNo || null,
					order.ORDER_NO || null,
					action,
					String(summary || action).slice(0, 255),
					details == null ? null : JSON.stringify(details),
					order.GRAND_TOTAL == null ? null : Number(order.GRAND_TOTAL),
					userId,
					req.user?.username || null,
					role,
					isAdmin ? 1 : 0,
				]
			);
		} catch (err) {
			console.warn('[OrderAuditTrail] could not record', action, err?.message || err);
		}
	}

	static _where({ branchId, action, startDate, endDate, search }) {
		const params = [];
		let sql = '1=1';
		if (branchId) {
			sql += ' AND t.BRANCH_ID = ?';
			params.push(Number(branchId));
		}
		if (action && ACTIONS.includes(action)) {
			sql += ' AND t.ACTION = ?';
			params.push(action);
		}
		if (search) {
			sql += ' AND t.ORDER_NO LIKE ?';
			params.push(`%${String(search).trim()}%`);
		}
		const range = phLocalDayRangeFilter('t.CREATED_DT', startDate, endDate);
		return { sql: sql + range.sql, params: [...params, ...range.params] };
	}

	/** Newest first, with the matching total and per-action counts. */
	static async list({ branchId = null, action = null, startDate = null, endDate = null, search = null, limit = 50, offset = 0 } = {}) {
		await ensureSchema();
		const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
		const off = Math.max(parseInt(offset, 10) || 0, 0);
		const where = OrderAuditTrailModel._where({ branchId, action, startDate, endDate, search });
		const [rows] = await pool.query(
			`SELECT t.IDNo, t.BRANCH_ID, b.BRANCH_NAME, t.ORDER_ID, t.ORDER_NO, t.ACTION, t.SUMMARY, t.DETAILS,
					t.AMOUNT, t.USER_ROLE, t.IS_ADMIN, o.STATUS AS CURRENT_STATUS,
					DATE_FORMAT(${phLocalDtSql('t.CREATED_DT')}, '%Y-%m-%d %H:%i:%s') AS CREATED_AT_PH
			 FROM order_audit_trail t
			 LEFT JOIN branches b ON b.IDNo = t.BRANCH_ID
			 LEFT JOIN orders o ON o.IDNo = t.ORDER_ID
			 WHERE ${where.sql}
			 ORDER BY t.CREATED_DT DESC, t.IDNo DESC
			 LIMIT ${lim} OFFSET ${off}`,
			where.params
		);
		// Counts ignore the action filter so the summary cards stay meaningful.
		const countWhere = OrderAuditTrailModel._where({ branchId, action: null, startDate, endDate, search });
		const [countRows] = await pool.query(
			`SELECT t.ACTION, COUNT(*) AS c FROM order_audit_trail t WHERE ${countWhere.sql} GROUP BY t.ACTION`,
			countWhere.params
		);
		const counts = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
		for (const r of countRows) counts[r.ACTION] = Number(r.c) || 0;
		const total = action && ACTIONS.includes(action)
			? counts[action]
			: Object.values(counts).reduce((s, n) => s + n, 0);
		return { rows: rows.map(OrderAuditTrailModel.toApi), total, counts };
	}

	static toApi(row) {
		let details = null;
		try {
			details = row.DETAILS ? JSON.parse(row.DETAILS) : null;
		} catch (_) {}
		return {
			id: row.IDNo,
			branch_id: row.BRANCH_ID,
			branch_name: row.BRANCH_NAME || null,
			order_id: row.ORDER_ID,
			order_no: row.ORDER_NO,
			action: row.ACTION,
			summary: row.SUMMARY,
			details,
			amount: row.AMOUNT == null ? null : parseFloat(row.AMOUNT),
			role: row.USER_ROLE || null,
			is_admin: Number(row.IS_ADMIN) === 1,
			current_status: row.CURRENT_STATUS == null ? null : Number(row.CURRENT_STATUS),
			created_at: row.CREATED_AT_PH,
		};
	}
}

module.exports = OrderAuditTrailModel;

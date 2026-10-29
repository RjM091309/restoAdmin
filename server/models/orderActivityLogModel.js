// ============================================
// ORDER ACTIVITY LOG MODEL
// ============================================
// What each waiter / cashier tablet did to an order — new order, items added
// or edited, room charge changed, table transfer, confirm, cancel, settle —
// one row per action (table order_activity_logs). Shown in the cashier app's
// Activity tab. Recording never throws: a logging failure must not fail the
// order action itself.
// ============================================

const pool = require('../config/db');
const UserModel = require('./userModel');
const { phLocalDtSql } = require('../utils/businessDay');
const { phLocalDayRangeFilter } = require('../utils/phDateRange');

const ACTIONS = [
	'order_created',
	'items_added',
	'items_edited',
	'room_charge',
	'transferred',
	'confirmed',
	'cancelled',
	'settled',
];

// user id → { at, fullname, role }: who did it, without a lookup per action.
const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const userCache = new Map();

/**
 * When the action really happened. A tablet that did it offline sends its
 * own time (`client_at`, Manila 'YYYY-MM-DD HH:MM:SS') when the queued action
 * syncs; it is kept between 3 days ago and now. Returns the DB-session time
 * to store and whether it is more than a minute before now (synced later),
 * or null to use now.
 */
async function resolveClientTime(req) {
	const raw = typeof req.body?.client_at === 'string' ? req.body.client_at.trim() : '';
	if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null;
	const [[row]] = await pool.execute(
		`SELECT DATE_FORMAT(x.at, '%Y-%m-%d %H:%i:%s') AS at, TIMESTAMPDIFF(SECOND, x.at, NOW()) AS lag
		 FROM (
			SELECT GREATEST(NOW() - INTERVAL 3 DAY, LEAST(NOW(),
				COALESCE(CONVERT_TZ(?, '+08:00', @@session.time_zone), DATE_SUB(?, INTERVAL 8 HOUR))
			)) AS at
		 ) x`,
		[raw, raw]
	);
	if (!row?.at) return null;
	return { at: row.at, late: Number(row.lag) > 60 };
}

async function resolveUser(req) {
	const userId = req.user?.user_id ?? null;
	const base = {
		userId,
		username: req.user?.username || null,
		fullname: null,
		role: null,
	};
	if (!userId) return base;
	const cached = userCache.get(userId);
	if (cached && Date.now() - cached.at < USER_CACHE_TTL_MS) {
		return { ...base, fullname: cached.fullname, role: cached.role };
	}
	try {
		const user = await UserModel.findByIdWithRole(userId);
		const fullname = [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim() || null;
		const role = user?.role || null;
		userCache.set(userId, { at: Date.now(), fullname, role });
		return { ...base, username: base.username || user?.username || null, fullname, role };
	} catch (_) {
		return base;
	}
}

const peso = (v) =>
	'₱' + (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qtyText = (v) => {
	const n = Number(v) || 0;
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
};

const hoursText = (h) => {
	const n = Number(h) || 0;
	if (n <= 0) return '0 hrs';
	if (n === 0.5) return '30 mins';
	return n === 1 ? '1 hr' : `${qtyText(n)} hrs`;
};

/** Order item rows → [{ menu_id, name, qty, line_total }], merged per menu item. */
function mergeItems(rows) {
	const byKey = new Map();
	for (const r of rows || []) {
		const menuId = r.MENU_ID ?? r.menu_id ?? null;
		const name = r.MENU_NAME ?? r.menu_name ?? r.name ?? 'Item';
		const key = menuId != null ? `m${menuId}` : `n${name}`;
		const prev = byKey.get(key) || { menu_id: menuId, name, qty: 0, line_total: 0 };
		prev.qty += parseFloat(r.QTY ?? r.qty ?? 0) || 0;
		prev.line_total += parseFloat(r.LINE_TOTAL ?? r.line_total ?? 0) || 0;
		byKey.set(key, prev);
	}
	return [...byKey.values()].map((i) => ({ ...i, line_total: Number(i.line_total.toFixed(2)) }));
}

const itemsText = (items, max = 3) => {
	const parts = items.slice(0, max).map((i) => `${qtyText(i.qty)}× ${i.name}`);
	if (items.length > max) parts.push(`+${items.length - max} more`);
	return parts.join(', ');
};

class OrderActivityLogModel {
	static get ACTIONS() {
		return ACTIONS;
	}

	static peso(v) {
		return peso(v);
	}

	static hoursText(h) {
		return hoursText(h);
	}

	static qtyText(v) {
		return qtyText(v);
	}

	static mergeItems(rows) {
		return mergeItems(rows);
	}

	static itemsText(items, max) {
		return itemsText(items, max);
	}

	/**
	 * Before/after item rows of an edit → { added, removed, changed } per menu
	 * item, for "Edited: +1 Coke, −2 Rice, Fries 1 → 3".
	 */
	static diffItems(beforeRows, afterRows) {
		const before = new Map(mergeItems(beforeRows).map((i) => [i.menu_id ?? i.name, i]));
		const after = new Map(mergeItems(afterRows).map((i) => [i.menu_id ?? i.name, i]));
		const added = [];
		const removed = [];
		const changed = [];
		for (const [key, a] of after) {
			const b = before.get(key);
			if (!b) added.push({ name: a.name, qty: a.qty });
			else if (Math.abs(a.qty - b.qty) > 0.0001) changed.push({ name: a.name, from: b.qty, to: a.qty });
		}
		for (const [key, b] of before) {
			if (!after.has(key)) removed.push({ name: b.name, qty: b.qty });
		}
		return { added, removed, changed };
	}

	/**
	 * Records one action. `order` needs IDNo, BRANCH_ID, ORDER_NO (FLOOR
	 * optional); `summary` is the one-line text shown in the log; `details`
	 * any JSON-able extra (items, from/to, payment); `amount` the order total
	 * after the action.
	 */
	static async record(req, { action, order, tableNumber = null, summary, details = null, amount = null }) {
		try {
			if (!order) return;
			const who = await resolveUser(req);
			const when = await resolveClientTime(req);
			await pool.execute(
				`INSERT INTO order_activity_logs
					(BRANCH_ID, ORDER_ID, ORDER_NO, TABLE_NUMBER, FLOOR, ACTION, SUMMARY, DETAILS, AMOUNT,
					 USER_ID, USERNAME, USER_FULLNAME, USER_ROLE, SYNCED_LATE, CREATED_DT)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
				[
					order.BRANCH_ID || null,
					order.IDNo || null,
					order.ORDER_NO || null,
					tableNumber || null,
					order.FLOOR || null,
					action,
					String(summary || action).slice(0, 255),
					details == null ? null : JSON.stringify(details),
					amount == null || !Number.isFinite(Number(amount)) ? null : Number(amount),
					who.userId,
					who.username,
					who.fullname,
					who.role,
					when?.late ? 1 : 0,
					when?.at || null,
				]
			);
		} catch (err) {
			console.warn('[ActivityLog] could not record', action, err?.message || err);
		}
	}

	/**
	 * A branch's log for one business day (Manila; Blue Moon's day runs to
	 * 07:00), newest first.
	 */
	static async list({ branchId, date = null, startDate = date, endDate = date, action = null, limit = 500 }) {
		const range = phLocalDayRangeFilter('CREATED_DT', startDate, endDate, 'BRANCH_ID');
		const params = [];
		let where = '1=1';
		if (branchId) {
			where += ' AND BRANCH_ID = ?';
			params.push(branchId);
		}
		if (action && ACTIONS.includes(action)) {
			where += ' AND ACTION = ?';
			params.push(action);
		}
		const lim = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000);
		const [rows] = await pool.execute(
			`SELECT IDNo, BRANCH_ID, ORDER_ID, ORDER_NO, TABLE_NUMBER, FLOOR, ACTION, SUMMARY, DETAILS, AMOUNT,
					USER_ID, USERNAME, USER_FULLNAME, USER_ROLE, SYNCED_LATE,
					DATE_FORMAT(${phLocalDtSql('CREATED_DT')}, '%Y-%m-%d %H:%i:%s') AS CREATED_AT_PH
			 FROM order_activity_logs
			 WHERE ${where}${range.sql}
			 ORDER BY CREATED_DT DESC, IDNo DESC
			 LIMIT ${lim}`,
			[...params, ...range.params]
		);
		return rows.map(OrderActivityLogModel.toApi);
	}

	static toApi(row) {
		let details = null;
		try {
			details = row.DETAILS ? JSON.parse(row.DETAILS) : null;
		} catch (_) {}
		return {
			id: row.IDNo,
			order_id: row.ORDER_ID,
			order_no: row.ORDER_NO,
			table_number: row.TABLE_NUMBER,
			floor: row.FLOOR,
			action: row.ACTION,
			summary: row.SUMMARY,
			details,
			amount: row.AMOUNT == null ? null : parseFloat(row.AMOUNT),
			user_id: row.USER_ID,
			username: row.USERNAME,
			user_fullname: row.USER_FULLNAME,
			user_role: row.USER_ROLE,
			synced_late: Number(row.SYNCED_LATE) === 1,
			created_at: row.CREATED_AT_PH,
		};
	}
}

module.exports = OrderActivityLogModel;

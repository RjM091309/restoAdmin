// ============================================
// ORDER ROOM CHARGE MODEL
// ============================================
// Room-charge history of an order (table order_room_charges): one row per room
// the order used, with that room's hourly rate, the hours billed there and the
// amount. The row with ENDED_AT NULL is the room the order is in now.
//
// orders.SERVICE_CHARGE stays the billed total (sum of these rows plus any
// non-room service charge), so reports and settlement keep working unchanged.
// Orders opened before this table existed get their row on first use
// (ensureForOrder), rebuilt from SERVICE_CHARGE / the table's ROOM_CHARGE.
// ============================================

const pool = require('../config/db');
const { phLocalDtSql } = require('../utils/businessDay');

const round2 = (v) => Number((Number(v) || 0).toFixed(2));

class OrderRoomChargeModel {
	/** Hours in 0.5 steps (one session = 1 hour), never negative. */
	static roundHours(value) {
		const n = parseFloat(value);
		return Number.isFinite(n) && n > 0 ? Math.round(n * 2) / 2 : 0;
	}

	static amountFor(rate, hours) {
		return round2((parseFloat(rate) || 0) * OrderRoomChargeModel.roundHours(hours));
	}

	/**
	 * Hours billed for time spent in a room the guest is leaving: whole
	 * half-hours only (37 minutes → 0.5 h, 1 h 10 m → 1 h).
	 */
	static billableHoursForMinutes(minutes) {
		const m = Math.max(0, Number(minutes) || 0);
		return Math.floor(m / 30) * 0.5;
	}

	/**
	 * Moving room-to-room before this many minutes carries the time over to the
	 * new room (old room billed nothing, same clock, new room's rate).
	 */
	static get CARRY_OVER_MINUTES() {
		return 30;
	}

	static isCarryOverMinutes(minutes) {
		return Math.max(0, Number(minutes) || 0) < OrderRoomChargeModel.CARRY_OVER_MINUTES;
	}

	/**
	 * When a room change happened, as a DB-session DATETIME string, plus the
	 * minutes from `sinceRaw` (the room's STARTED_AT_RAW) to then.
	 * `phLocal` is the tablet's Asia/Manila time of the change ('YYYY-MM-DD
	 * HH:MM:SS') — sent by transfers queued offline, which reach the server
	 * later; it is kept between the room's start and now. Without it: now.
	 */
	static async resolveEventTime(phLocal, sinceRaw = null) {
		const ph = typeof phLocal === 'string' ? phLocal.trim() : '';
		const valid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ph);
		const atExpr = valid
			? `LEAST(NOW(), COALESCE(CONVERT_TZ(?, '+08:00', @@session.time_zone), DATE_SUB(?, INTERVAL 8 HOUR)))`
			: 'NOW()';
		const atParams = valid ? [ph, ph] : [];
		const inner = sinceRaw ? `GREATEST(?, ${atExpr})` : atExpr;
		const [[row]] = await pool.execute(
			`SELECT DATE_FORMAT(x.at, '%Y-%m-%d %H:%i:%s') AS at,
				${sinceRaw ? 'GREATEST(0, TIMESTAMPDIFF(MINUTE, ?, x.at))' : 'NULL'} AS minutes
			 FROM (SELECT ${inner} AS at) x`,
			sinceRaw ? [sinceRaw, sinceRaw, ...atParams] : atParams
		);
		return { at: row.at, minutes: row.minutes == null ? null : Number(row.minutes) };
	}

	/**
	 * The Asia/Manila time embedded in a tablet order number
	 * (ORD-YYYYMMDD-HHMMSS) as 'YYYY-MM-DD HH:MM:SS', or null. Unlike an
	 * offline order's ENCODED_DT (the tablet's own clock, stored as-is) this is
	 * always Manila time — the tablets read order times the same way.
	 */
	static phLocalFromOrderNo(orderNo) {
		const m = String(orderNo || '').match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
		return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null;
	}

	/** When an order's first room started: its order-number time, else `fallback`. */
	static async orderStartTime(orderNo, fallback = null) {
		const ph = OrderRoomChargeModel.phLocalFromOrderNo(orderNo);
		if (!ph) return fallback || null;
		return (await OrderRoomChargeModel.resolveEventTime(ph)).at;
	}

	static _selectSql(where) {
		const fmt = (col) => `DATE_FORMAT(${phLocalDtSql(col)}, '%Y-%m-%d %H:%i:%s')`;
		return `
			SELECT
				IDNo,
				ORDER_ID,
				TABLE_ID,
				TABLE_NUMBER,
				RATE,
				HOURS,
				AMOUNT,
				ENDED_AT,
				DATE_FORMAT(STARTED_AT, '%Y-%m-%d %H:%i:%s') AS STARTED_AT_RAW,
				${fmt('STARTED_AT')} AS STARTED_AT_PH,
				${fmt('ENDED_AT')} AS ENDED_AT_PH,
				GREATEST(0, TIMESTAMPDIFF(MINUTE, STARTED_AT, COALESCE(ENDED_AT, NOW()))) AS MINUTES_USED
			FROM order_room_charges
			WHERE ${where}
			ORDER BY STARTED_AT ASC, IDNo ASC
		`;
	}

	static async getByOrderId(orderId, conn = pool) {
		const [rows] = await conn.execute(OrderRoomChargeModel._selectSql('ORDER_ID = ?'), [orderId]);
		return rows;
	}

	/** Map of order id → rows, one query for a whole order list. */
	static async getByOrderIds(orderIds) {
		const ids = [...new Set((orderIds || []).map((id) => parseInt(id, 10)).filter((id) => id > 0))];
		const byOrder = new Map();
		if (!ids.length) return byOrder;
		const placeholders = ids.map(() => '?').join(',');
		const [rows] = await pool.execute(
			OrderRoomChargeModel._selectSql(`ORDER_ID IN (${placeholders})`),
			ids
		);
		for (const row of rows) {
			const key = parseInt(row.ORDER_ID, 10);
			if (!byOrder.has(key)) byOrder.set(key, []);
			byOrder.get(key).push(row);
		}
		return byOrder;
	}

	/** API / socket shape (times are Asia/Manila wall-clock strings). */
	static toApi(row) {
		return {
			id: row.IDNo,
			table_id: row.TABLE_ID,
			table_number: row.TABLE_NUMBER || null,
			rate: parseFloat(row.RATE || 0),
			hours: parseFloat(row.HOURS || 0),
			amount: parseFloat(row.AMOUNT || 0),
			started_at: row.STARTED_AT_PH || null,
			ended_at: row.ENDED_AT_PH || null,
			minutes_used: Number(row.MINUTES_USED) || 0,
			active: row.ENDED_AT == null,
		};
	}

	static listToApi(rows) {
		return (rows || []).map(OrderRoomChargeModel.toApi);
	}

	static sumAmount(rows) {
		return round2((rows || []).reduce((sum, r) => sum + (parseFloat(r.AMOUNT) || 0), 0));
	}

	static activeOf(rows) {
		const open = (rows || []).filter((r) => r.ENDED_AT == null);
		return open.length ? open[open.length - 1] : null;
	}

	static async start({ orderId, branchId, tableId, tableNumber, rate, hours, startedAt = null, userId = null }, conn = pool) {
		const h = OrderRoomChargeModel.roundHours(hours);
		await conn.execute(
			`INSERT INTO order_room_charges
				(ORDER_ID, BRANCH_ID, TABLE_ID, TABLE_NUMBER, RATE, HOURS, AMOUNT, STARTED_AT, ENCODED_BY)
			 VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
			[
				orderId,
				branchId || null,
				tableId || null,
				tableNumber || null,
				round2(rate),
				h,
				OrderRoomChargeModel.amountFor(rate, h),
				startedAt || null,
				userId || null,
			]
		);
	}

	/**
	 * Rows for an order, creating the first one for an order opened before this
	 * table existed (or by a path that doesn't record it, e.g. the web admin):
	 * the room it's in now, at SERVICE_CHARGE / ROOM_CHARGE hours.
	 * `order` needs IDNo, BRANCH_ID, TABLE_ID, SERVICE_CHARGE; `table` is the
	 * order's current restaurant_tables row.
	 */
	static async ensureForOrder(order, table, userId = null) {
		const rows = await OrderRoomChargeModel.getByOrderId(order.IDNo);
		if (rows.length) return rows;
		const rate = parseFloat(table?.ROOM_CHARGE) || 0;
		if (!order.TABLE_ID || rate <= 0) return rows;

		const [[orderRow]] = await pool.execute(
			"SELECT ORDER_NO, DATE_FORMAT(ENCODED_DT, '%Y-%m-%d %H:%i:%s') AS ENCODED_DT FROM orders WHERE IDNo = ? LIMIT 1",
			[order.IDNo]
		);
		const hours = OrderRoomChargeModel.roundHours((parseFloat(order.SERVICE_CHARGE) || 0) / rate);
		await OrderRoomChargeModel.start({
			orderId: order.IDNo,
			branchId: order.BRANCH_ID,
			tableId: order.TABLE_ID,
			tableNumber: table?.TABLE_NUMBER,
			rate,
			hours,
			startedAt: await OrderRoomChargeModel.orderStartTime(orderRow?.ORDER_NO, orderRow?.ENCODED_DT),
			userId,
		});
		return OrderRoomChargeModel.getByOrderId(order.IDNo);
	}

	/** Sets the hours billed in the room the order is in now. */
	static async setActiveHours(rowId, hours, userId = null, conn = pool) {
		const h = OrderRoomChargeModel.roundHours(hours);
		await conn.execute(
			`UPDATE order_room_charges
			 SET HOURS = ?, AMOUNT = ROUND(RATE * ?, 2), EDITED_BY = ?, EDITED_DT = NOW()
			 WHERE IDNo = ?`,
			[h, h, userId || null, rowId]
		);
	}

	/**
	 * Closes the current room with the hours billed there (order moved out),
	 * at `endedAt` (DB-session DATETIME, see resolveEventTime) or now.
	 */
	static async close(rowId, hours, userId = null, conn = pool, endedAt = null) {
		const h = OrderRoomChargeModel.roundHours(hours);
		await conn.execute(
			`UPDATE order_room_charges
			 SET HOURS = ?, AMOUNT = ROUND(RATE * ?, 2), ENDED_AT = COALESCE(?, NOW()), EDITED_BY = ?, EDITED_DT = NOW()
			 WHERE IDNo = ?`,
			[h, h, endedAt || null, userId || null, rowId]
		);
	}

	/** Stops the clock on every open room of an order (settled / cancelled). */
	static async endAll(orderId, conn = pool) {
		await conn.execute(
			'UPDATE order_room_charges SET ENDED_AT = NOW() WHERE ORDER_ID = ? AND ENDED_AT IS NULL',
			[orderId]
		);
	}
}

module.exports = OrderRoomChargeModel;

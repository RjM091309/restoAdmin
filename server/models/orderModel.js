// ============================================
// ORDER MODEL
// ============================================
// File: models/orderModel.js
// Description: Database queries for orders
// ============================================

const pool = require('../config/db');

class OrderModel {
	static async getAll(branchId = null) {
		let query = `
			SELECT 
				o.IDNo,
				o.BRANCH_ID,
				b.BRANCH_NAME,
				b.BRANCH_CODE,
				b.BRANCH_NAME AS BRANCH_LABEL,
				o.ORDER_NO,
				o.TABLE_ID,
				t.TABLE_NUMBER,
				o.ORDER_TYPE,
				o.STATUS,
				o.SUBTOTAL,
				o.TAX_AMOUNT,
				o.SERVICE_CHARGE,
				o.DISCOUNT_AMOUNT,
				o.GRAND_TOTAL,
				o.ENCODED_DT,
				o.ENCODED_BY,
				ui.FIRSTNAME AS ENCODED_BY_NAME,
				bill.PAYMENT_METHOD AS payment_method
			FROM orders o
			LEFT JOIN restaurant_tables t ON t.IDNo = o.TABLE_ID
			LEFT JOIN branches b ON b.IDNo = o.BRANCH_ID
			LEFT JOIN user_info ui ON ui.IDNo = o.ENCODED_BY
			LEFT JOIN billing bill ON bill.ORDER_ID = o.IDNo
			WHERE 1=1
		`;

		const params = [];
		if (branchId) {
			query += ` AND o.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY o.ENCODED_DT DESC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async getById(id) {
		const query = `
			SELECT 
				o.IDNo,
				o.BRANCH_ID,
				o.ORDER_NO,
				o.TABLE_ID,
				o.ORDER_TYPE,
				o.STATUS,
				o.SUBTOTAL,
				o.TAX_AMOUNT,
				o.SERVICE_CHARGE,
				o.DISCOUNT_AMOUNT,
				o.GRAND_TOTAL,
				bill.PAYMENT_METHOD AS payment_method
			FROM orders o
			LEFT JOIN billing bill ON bill.ORDER_ID = o.IDNo
			WHERE o.IDNo = ?
			LIMIT 1
		`;
		const [rows] = await pool.execute(query, [id]);
		return rows[0] || null;
	}

	static async create(data) {
		const {
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
			user_id
		} = data;

		const query = `
			INSERT INTO orders (
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
				ENCODED_BY
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		const values = [
			BRANCH_ID,
			ORDER_NO,
			TABLE_ID || null,
			ORDER_TYPE || null,
			STATUS || 3,
			SUBTOTAL || 0,
			TAX_AMOUNT || 0,
			SERVICE_CHARGE || 0,
			DISCOUNT_AMOUNT || 0,
			GRAND_TOTAL || 0,
			user_id
		];

		const [result] = await pool.execute(query, values);
		return result.insertId;
	}

	static async update(id, data) {
		const {
			TABLE_ID,
			ORDER_TYPE,
			STATUS,
			SUBTOTAL,
			TAX_AMOUNT,
			SERVICE_CHARGE,
			DISCOUNT_AMOUNT,
			GRAND_TOTAL,
			user_id
		} = data;

		const query = `
			UPDATE orders SET
				TABLE_ID = ?,
				ORDER_TYPE = ?,
				STATUS = ?,
				SUBTOTAL = ?,
				TAX_AMOUNT = ?,
				SERVICE_CHARGE = ?,
				DISCOUNT_AMOUNT = ?,
				GRAND_TOTAL = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ?
		`;

		const values = [
			TABLE_ID || null,
			ORDER_TYPE || null,
			STATUS || 3,
			SUBTOTAL || 0,
			TAX_AMOUNT || 0,
			SERVICE_CHARGE || 0,
			DISCOUNT_AMOUNT || 0,
			GRAND_TOTAL || 0,
			user_id,
			id
		];

		const [result] = await pool.execute(query, values);
		return true; // Return true as long as no exception occurred
	}

	static async updateStatus(id, status, user_id) {
		const query = `
			UPDATE orders SET
				STATUS = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ?
		`;
		const [result] = await pool.execute(query, [status, user_id, id]);
		return result.affectedRows > 0;
	}

	// Get orders by user ID (for mobile app sync)
	static async getByUserId(userId, branchId = null) {
		let query = `
			SELECT 
				o.IDNo,
				o.BRANCH_ID,
				o.ORDER_NO,
				o.TABLE_ID,
				o.ORDER_TYPE,
				o.STATUS,
				o.SUBTOTAL,
				o.TAX_AMOUNT,
				o.SERVICE_CHARGE,
				o.DISCOUNT_AMOUNT,
				o.GRAND_TOTAL,
				o.ENCODED_DT,
				o.ENCODED_BY
			FROM orders o
			WHERE o.ENCODED_BY = ?
		`;

		const params = [userId];
		if (branchId) {
			query += ` AND o.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY o.ENCODED_DT DESC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	// Get orders by table ID (for mobile app sync after login/restart)
	static async getByTableId(tableId, branchId = null) {
		let query = `
			SELECT 
				o.IDNo,
				o.BRANCH_ID,
				o.ORDER_NO,
				o.TABLE_ID,
				o.ORDER_TYPE,
				o.STATUS,
				o.SUBTOTAL,
				o.TAX_AMOUNT,
				o.SERVICE_CHARGE,
				o.DISCOUNT_AMOUNT,
				o.GRAND_TOTAL,
				o.ENCODED_DT,
				o.ENCODED_BY
			FROM orders o
			WHERE o.TABLE_ID = ? AND o.STATUS != 1
		`;

		const params = [tableId];
		if (branchId) {
			query += ` AND o.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY o.ENCODED_DT DESC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	// Get orders by user ID or table ID (for mobile app sync)
	static async getByUserIdOrTableId(userId, tableId, branchId = null) {
		let query, params;
		
		if (tableId != null) {
			// Get orders by table_id (priority) or user_id, exclude SETTLED orders (STATUS = 1)
			query = `
				SELECT 
					o.IDNo,
					o.BRANCH_ID,
					o.ORDER_NO,
					o.TABLE_ID,
					o.ORDER_TYPE,
					o.STATUS,
					o.SUBTOTAL,
					o.TAX_AMOUNT,
					o.SERVICE_CHARGE,
					o.DISCOUNT_AMOUNT,
					o.GRAND_TOTAL,
					o.ENCODED_DT,
					o.ENCODED_BY
				FROM orders o
				WHERE (o.TABLE_ID = ? OR o.ENCODED_BY = ?) AND o.STATUS != 1
			`;
			params = [tableId, userId];
		} else {
			// Get orders by user_id only, exclude SETTLED orders
			query = `
				SELECT 
					o.IDNo,
					o.BRANCH_ID,
					o.ORDER_NO,
					o.TABLE_ID,
					o.ORDER_TYPE,
					o.STATUS,
					o.SUBTOTAL,
					o.TAX_AMOUNT,
					o.SERVICE_CHARGE,
					o.DISCOUNT_AMOUNT,
					o.GRAND_TOTAL,
					o.ENCODED_DT,
					o.ENCODED_BY
				FROM orders o
				WHERE o.ENCODED_BY = ? AND o.STATUS != 1
			`;
			params = [userId];
		}

		if (branchId) {
			query += ` AND o.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY o.ENCODED_DT DESC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	// Get kitchen orders - orders that have items with PENDING (3) or PREPARING (2) status
	// Kitchen needs to see all active orders based on order_items status, not orders.status
	static async getKitchenOrders(branchId = null) {
		let query = `
			SELECT DISTINCT
				o.IDNo,
				o.BRANCH_ID,
				o.ORDER_NO,
				o.TABLE_ID,
				t.TABLE_NUMBER,
				o.ORDER_TYPE,
				o.STATUS,
				o.SUBTOTAL,
				o.TAX_AMOUNT,
				o.SERVICE_CHARGE,
				o.DISCOUNT_AMOUNT,
				o.GRAND_TOTAL,
				o.ENCODED_DT,
				o.ENCODED_BY
			FROM orders o
			LEFT JOIN restaurant_tables t ON t.IDNo = o.TABLE_ID
			INNER JOIN order_items oi ON oi.ORDER_ID = o.IDNo
			WHERE oi.STATUS IN (3, 2)  -- PENDING (3) or PREPARING (2) items
		`;

		const params = [];
		if (branchId) {
			query += ` AND o.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY o.ENCODED_DT ASC -- Oldest first (FIFO)`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}
}

module.exports = OrderModel;

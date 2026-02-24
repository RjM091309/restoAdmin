// ============================================
// BILLING MODEL
// ============================================
// File: models/billingModel.js
// Description: Database queries for billing records
// ============================================

const pool = require('../config/db');

class BillingModel {
	static async getAll(branchId = null) {
		let query = `
			SELECT 
				b.IDNo,
				b.BRANCH_ID,
				br.BRANCH_NAME,
				br.BRANCH_CODE,
				br.BRANCH_NAME AS BRANCH_LABEL,
				b.ORDER_ID,
				o.ORDER_NO,
				b.PAYMENT_METHOD,
				b.AMOUNT_DUE,
				b.AMOUNT_PAID,
				b.PAYMENT_REF,
				b.STATUS,
				b.ENCODED_BY,
				ui.FIRSTNAME AS ENCODED_BY_NAME,
				b.ENCODED_DT
			FROM billing b
			LEFT JOIN orders o ON o.IDNo = b.ORDER_ID
			LEFT JOIN branches br ON br.IDNo = b.BRANCH_ID
			LEFT JOIN user_info ui ON ui.IDNo = b.ENCODED_BY
			WHERE o.STATUS IN (2, 1)
		`;

		const params = [];
		if (branchId) {
			query += ` AND b.BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY b.ENCODED_DT DESC, b.IDNo DESC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async getByOrderId(orderId) {
		const query = `
			SELECT 
				b.IDNo,
				b.ORDER_ID,
				o.ORDER_NO,
				b.PAYMENT_METHOD,
				b.AMOUNT_DUE,
				b.AMOUNT_PAID,
				b.PAYMENT_REF,
				b.STATUS,
				b.ENCODED_BY,
				ui.FIRSTNAME AS ENCODED_BY_NAME,
				b.ENCODED_DT
			FROM billing b
			LEFT JOIN orders o ON o.IDNo = b.ORDER_ID
			LEFT JOIN user_info ui ON ui.IDNo = b.ENCODED_BY
			WHERE b.ORDER_ID = ?
			LIMIT 1
		`;

		const [rows] = await pool.execute(query, [orderId]);
		return rows[0] || null;
	}

	static async createForOrder(data) {
		const {
			branch_id,
			order_id,
			payment_method,
			amount_due,
			amount_paid,
			payment_ref,
			status,
			user_id
		} = data;

		const query = `
			INSERT INTO billing (
				BRANCH_ID,
				ORDER_ID,
				PAYMENT_METHOD,
				AMOUNT_DUE,
				AMOUNT_PAID,
				PAYMENT_REF,
				STATUS,
				ENCODED_BY,
				ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		await pool.execute(query, [
			branch_id,
			order_id,
			payment_method || 'CASH',
			amount_due || 0,
			amount_paid || 0,
			payment_ref || null,
			status || 3,
			user_id,
			new Date()
		]);
	}

	static async updateForOrder(orderId, data) {
		const {
			payment_method,
			amount_due,
			amount_paid,
			payment_ref,
			status
		} = data;

		// Fetch current billing record to preserve values if they aren't provided
		const current = await this.getByOrderId(orderId);
		if (!current) return false;

		const query = `
			UPDATE billing SET
				PAYMENT_METHOD = ?,
				AMOUNT_DUE = ?,
				AMOUNT_PAID = ?,
				PAYMENT_REF = ?,
				STATUS = ?
			WHERE ORDER_ID = ?
		`;

		await pool.execute(query, [
			payment_method || current.PAYMENT_METHOD || 'CASH',
			amount_due !== undefined ? amount_due : current.AMOUNT_DUE,
			amount_paid !== undefined ? amount_paid : current.AMOUNT_PAID,
			payment_ref || current.PAYMENT_REF || null,
			status !== undefined ? status : current.STATUS,
			orderId
		]);
		return true;
	}

	static async recordTransaction(data) {
		const { order_id, payment_method, amount_paid, payment_ref, user_id } = data;
		const query = `
			INSERT INTO payment_transactions (
				ORDER_ID, PAYMENT_METHOD, AMOUNT_PAID, PAYMENT_REF, ENCODED_BY
			) VALUES (?, ?, ?, ?, ?)
		`;
		await pool.execute(query, [order_id, payment_method, amount_paid, payment_ref, user_id]);
	}

	static async getPaymentHistory(orderId) {
		const query = `SELECT * FROM payment_transactions WHERE ORDER_ID = ? ORDER BY ENCODED_DT DESC`;
		const [rows] = await pool.execute(query, [orderId]);
		return rows;
	}

	static async updateRefundForOrder(orderId, refundAmount, refundDt, refundReason) {
		// Only update the refund columns. We keep AMOUNT_PAID as the gross amount received.
		const query = `
			UPDATE billing SET
				REFUND = ?,
				REFUND_DT = ?,
				REFUND_REASON = ?
			WHERE ORDER_ID = ?
		`;

		const [result] = await pool.execute(query, [refundAmount, refundDt, refundReason, orderId]);
		return result.affectedRows > 0;
	}
}

module.exports = BillingModel;

// ============================================
// ORDER ITEMS MODEL
// ============================================
// File: models/orderItemsModel.js
// Description: Database queries for order items
// ============================================

const pool = require('../config/db');

class OrderItemsModel {
	static async getByOrderId(orderId) {
		const query = `
			SELECT
				oi.IDNo,
				oi.ORDER_ID,
				oi.MENU_ID,
				m.MENU_NAME,
				oi.QTY,
				oi.UNIT_PRICE,
				oi.LINE_TOTAL,
				oi.STATUS,
				oi.REMARKS,
				oi.EDITED_BY,
				u.FIRSTNAME AS PREPARED_BY
			FROM order_items oi
			LEFT JOIN menu m ON m.IDNo = oi.MENU_ID
			LEFT JOIN user_info u ON u.IDNo = oi.EDITED_BY
			WHERE oi.ORDER_ID = ?
			ORDER BY oi.ENCODED_DT ASC
		`;

		const [rows] = await pool.execute(query, [orderId]);
		return rows;
	}

	static async createForOrder(orderId, items, user_id) {
		if (!items.length) {
			return;
		}

		const query = `
			INSERT INTO order_items (
				ORDER_ID,
				MENU_ID,
				QTY,
				UNIT_PRICE,
				LINE_TOTAL,
				STATUS,
				ENCODED_BY,
				ENCODED_DT
			) VALUES ?
		`;

		const values = items.map(item => [
			orderId,
			item.menu_id,
			item.qty,
			item.unit_price,
			item.line_total,
			item.status || 3,  // Default: 3=PENDING
			user_id,
			new Date()
		]);

		await pool.query(query, [values]);
	}

	static async replaceForOrder(orderId, items, user_id) {
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			await connection.execute('DELETE FROM order_items WHERE ORDER_ID = ?', [orderId]);

			if (items.length) {
				const query = `
					INSERT INTO order_items (
						ORDER_ID,
						MENU_ID,
						QTY,
						UNIT_PRICE,
						LINE_TOTAL,
						STATUS,
						ENCODED_BY,
						ENCODED_DT
					) VALUES ?
				`;

				const values = items.map(item => [
					orderId,
					item.menu_id,
					item.qty,
					item.unit_price,
					item.line_total,
					item.status || 3,  // Default: 3=PENDING
					user_id,
					new Date()
				]);

				await connection.query(query, [values]);
			}

			await connection.commit();
		} catch (err) {
			await connection.rollback();
			throw err;
		} finally {
			connection.release();
		}
	}

	static async updateStatus(id, status, user_id) {
		const query = `
			UPDATE order_items 
			SET STATUS = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ?
		`;
		const [result] = await pool.execute(query, [status, user_id, id]);
		return result.affectedRows > 0;
	}
}

module.exports = OrderItemsModel;

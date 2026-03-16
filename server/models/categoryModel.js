// Category model: DB operations for menu categories

const pool = require('../config/db');

class CategoryModel {
	static async getAll(branchId = null) {
		let query = `SELECT IDNo, CAT_NAME, CAT_DESC, ACTIVE, ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT FROM categories WHERE ACTIVE = 1`;
		const params = [];
		if (branchId != null) {
			query += ` AND BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY IDNo ASC`;

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async getById(id) {
		const [rows] = await pool.execute('SELECT * FROM categories WHERE IDNo = ? AND ACTIVE = 1', [id]);
		return rows[0];
	}

	// IDNo may not be AUTO_INCREMENT; use MAX+1 to avoid duplicate key
	static async create(data) {
		const { CAT_NAME, CAT_DESC, BRANCH_ID, user_id } = data;
		const branchId = BRANCH_ID != null && BRANCH_ID !== '' ? Number(BRANCH_ID) : null;
		const encodedBy = user_id != null && user_id !== '' ? Number(user_id) : null;
		const [rows] = await pool.execute('SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM categories');
		const nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
		const now = new Date();

		await pool.execute(
			'INSERT INTO categories (IDNo, BRANCH_ID, CAT_NAME, CAT_DESC, ACTIVE, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, 1, ?, ?)',
			[nextId, branchId, (String(CAT_NAME || '')).trim(), CAT_DESC || null, encodedBy, now]
		);
		return nextId;
	}

	static async update(id, data) {
		const { CAT_NAME, CAT_DESC, user_id } = data;
		const now = new Date();
		const [result] = await pool.execute(
			'UPDATE categories SET CAT_NAME = ?, CAT_DESC = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ? AND ACTIVE = 1',
			[CAT_NAME.trim(), CAT_DESC || null, user_id, now, id]
		);
		return result.affectedRows > 0;
	}

	static async delete(id, user_id) {
		const now = new Date();
		const [result] = await pool.execute('UPDATE categories SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?', [user_id, now, id]);
		return result.affectedRows > 0;
	}
}

module.exports = CategoryModel;


const pool = require('../config/db');

class CategoryInventoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (CategoryInventoryModel._schemaReady) return;
		if (CategoryInventoryModel._schemaPromise) return CategoryInventoryModel._schemaPromise;

		CategoryInventoryModel._schemaPromise = (async () => {
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_categories (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					CATEGORY_NAME VARCHAR(120) NOT NULL,
					CATEGORY_TYPE VARCHAR(80) NOT NULL DEFAULT 'Inventory',
					DESCRIPTION TEXT NULL,
					ICON VARCHAR(80) NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_categories_branch (BRANCH_ID),
					INDEX idx_inventory_categories_active (ACTIVE),
					INDEX idx_inventory_categories_type (CATEGORY_TYPE)
				)
			`);

			CategoryInventoryModel._schemaReady = true;
			CategoryInventoryModel._schemaPromise = null;
		})();

		return CategoryInventoryModel._schemaPromise;
	}

	static async getAll(branchId = null) {
		await CategoryInventoryModel.ensureSchema();
		let query = `
			SELECT
				IDNo,
				BRANCH_ID,
				CATEGORY_NAME,
				CATEGORY_TYPE,
				DESCRIPTION,
				ICON,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT,
				EDITED_BY,
				EDITED_DT
			FROM inventory_categories
			WHERE ACTIVE = 1
		`;
		const params = [];

		if (branchId !== null && branchId !== undefined) {
			query += ` AND BRANCH_ID = ?`;
			params.push(branchId);
		}

		query += ` ORDER BY IDNo DESC`;
		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async getById(id) {
		await CategoryInventoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`SELECT * FROM inventory_categories WHERE IDNo = ? AND ACTIVE = 1`,
			[id]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await CategoryInventoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`INSERT INTO inventory_categories (
				BRANCH_ID,
				CATEGORY_NAME,
				CATEGORY_TYPE,
				DESCRIPTION,
				ICON,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
			[
				Number(data.BRANCH_ID),
				String(data.CATEGORY_NAME).trim(),
				String(data.CATEGORY_TYPE || 'Inventory'),
				data.DESCRIPTION || null,
				data.ICON || null,
				data.user_id || null,
				currentDate,
			]
		);
		return result.insertId;
	}

	static async update(id, data) {
		await CategoryInventoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`UPDATE inventory_categories
			SET CATEGORY_NAME = ?,
				CATEGORY_TYPE = ?,
				DESCRIPTION = ?,
				ICON = ?,
				EDITED_BY = ?,
				EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[
				String(data.CATEGORY_NAME).trim(),
				String(data.CATEGORY_TYPE || 'Inventory'),
				data.DESCRIPTION || null,
				data.ICON || null,
				data.user_id || null,
				currentDate,
				id,
			]
		);
		return result.affectedRows > 0;
	}

	static async delete(id, userId = null) {
		await CategoryInventoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`UPDATE inventory_categories
			SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[userId, currentDate, id]
		);
		return result.affectedRows > 0;
	}
}

module.exports = CategoryInventoryModel;

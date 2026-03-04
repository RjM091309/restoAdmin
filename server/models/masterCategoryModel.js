const pool = require('../config/db');
const BranchModel = require('./branchModel');

class MasterCategoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (MasterCategoryModel._schemaReady) return;
		if (MasterCategoryModel._schemaPromise) return MasterCategoryModel._schemaPromise;

		MasterCategoryModel._schemaPromise = (async () => {
			await BranchModel.ensureSchema();

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS master_categories (
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
					INDEX idx_master_categories_branch (BRANCH_ID),
					INDEX idx_master_categories_active (ACTIVE),
					INDEX idx_master_categories_type (CATEGORY_TYPE),
					CONSTRAINT fk_master_categories_branch
						FOREIGN KEY (BRANCH_ID) REFERENCES branches(IDNo)
						ON UPDATE CASCADE ON DELETE RESTRICT
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);

			MasterCategoryModel._schemaReady = true;
			MasterCategoryModel._schemaPromise = null;
		})().catch((error) => {
			MasterCategoryModel._schemaPromise = null;
			throw error;
		});

		return MasterCategoryModel._schemaPromise;
	}

	static async getAll(branchId = null, categoryType = 'Inventory') {
		try {
			await MasterCategoryModel.ensureSchema();
		} catch (schemaErr) {
			console.warn('[MasterCategoryModel.getAll] ensureSchema failed:', schemaErr?.message);
			// Table may already exist; continue with query
		}
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
			FROM master_categories
			WHERE ACTIVE = 1
		`;
		const params = [];

		if (branchId !== null && branchId !== undefined) {
			query += ` AND BRANCH_ID = ?`;
			params.push(branchId);
		}
		if (categoryType !== null && categoryType !== undefined && String(categoryType).trim() !== '') {
			query += ` AND CATEGORY_TYPE = ?`;
			params.push(String(categoryType).trim());
		}

		query += ` ORDER BY IDNo DESC`;
		try {
			const [rows] = await pool.execute(query, params);
			return rows;
		} catch (selectErr) {
			// If explicit columns fail (e.g. missing columns), try SELECT *
			if (selectErr.message && (selectErr.message.includes('Unknown column') || selectErr.message.includes("doesn't exist"))) {
				const fallbackQuery = `SELECT * FROM master_categories WHERE ACTIVE = 1${branchId !== null && branchId !== undefined ? ' AND BRANCH_ID = ?' : ''}${categoryType !== null && categoryType !== undefined && String(categoryType).trim() !== '' ? ' AND CATEGORY_TYPE = ?' : ''} ORDER BY IDNo DESC`;
				const [fallbackRows] = await pool.execute(fallbackQuery, params);
				return fallbackRows;
			}
			throw selectErr;
		}
	}

	static async getById(id) {
		await MasterCategoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`SELECT * FROM master_categories WHERE IDNo = ? AND ACTIVE = 1 AND CATEGORY_TYPE = 'Inventory'`,
			[id]
		);
		return rows[0] || null;
	}

	static async getByIdForBranch(branchId, id) {
		await MasterCategoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				IDNo,
				BRANCH_ID,
				CATEGORY_NAME,
				CATEGORY_TYPE,
				DESCRIPTION,
				ICON,
				ACTIVE
			FROM master_categories
			WHERE ACTIVE = 1
				AND BRANCH_ID = ?
				AND IDNo = ?
			LIMIT 1
			`,
			[Number(branchId), Number(id)]
		);
		return rows[0] || null;
	}

	static async getByTypeAndName(branchId, categoryType, categoryName) {
		await MasterCategoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				IDNo,
				BRANCH_ID,
				CATEGORY_NAME,
				CATEGORY_TYPE,
				DESCRIPTION,
				ICON,
				ACTIVE
			FROM master_categories
			WHERE ACTIVE = 1
				AND BRANCH_ID = ?
				AND CATEGORY_TYPE = ?
				AND CATEGORY_NAME = ?
			LIMIT 1
			`,
			[Number(branchId), String(categoryType), String(categoryName)]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await MasterCategoryModel.ensureSchema();
		const currentDate = new Date();
		const values = [
			Number(data.BRANCH_ID),
			String(data.CATEGORY_NAME).trim(),
			String(data.CATEGORY_TYPE || 'Inventory'),
			data.DESCRIPTION || null,
			data.ICON || null,
			data.user_id || null,
			currentDate,
		];
		try {
			const [result] = await pool.execute(
				`INSERT INTO master_categories (
					BRANCH_ID,
					CATEGORY_NAME,
					CATEGORY_TYPE,
					DESCRIPTION,
					ICON,
					ACTIVE,
					ENCODED_BY,
					ENCODED_DT
				) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
				values
			);
			return result.insertId;
		} catch (err) {
			const msg = String(err.message || '');
			if (msg.includes('IDNo') && msg.includes('default')) {
				const [rows] = await pool.execute(
					`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM master_categories`
				);
				const nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
				await pool.execute(
					`INSERT INTO master_categories (
						IDNo,
						BRANCH_ID,
						CATEGORY_NAME,
						CATEGORY_TYPE,
						DESCRIPTION,
						ICON,
						ACTIVE,
						ENCODED_BY,
						ENCODED_DT
					) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
					[nextId, ...values]
				);
				return nextId;
			}
			throw err;
		}
	}

	static async update(id, data) {
		await MasterCategoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`UPDATE master_categories
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
		await MasterCategoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`UPDATE master_categories
			SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[userId, currentDate, id]
		);
		return result.affectedRows > 0;
	}
}

module.exports = MasterCategoryModel;

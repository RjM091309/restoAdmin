// Category model: DB operations for menu categories

const pool = require('../config/db');

class CategoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	/** Nullable PARENT_CAT_ID: null = main category; set = subcategory under that main (one level). */
	static async ensureSchema() {
		if (CategoryModel._schemaReady) return;
		if (CategoryModel._schemaPromise) return CategoryModel._schemaPromise;

		CategoryModel._schemaPromise = (async () => {
			try {
				await pool.execute(`
					ALTER TABLE categories
					ADD COLUMN PARENT_CAT_ID INT NULL
				`);
			} catch (e) {
				const msg = String(e?.message || '');
				if (!/Duplicate column name/i.test(msg)) {
					console.warn('[CategoryModel] ensureSchema PARENT_CAT_ID:', msg);
				}
			}
			try {
				await pool.execute(`
					ALTER TABLE categories
					ADD INDEX idx_categories_parent (PARENT_CAT_ID)
				`);
			} catch (e) {
				const msg = String(e?.message || '');
				if (!/Duplicate key name/i.test(msg)) {
					console.warn('[CategoryModel] ensureSchema idx_categories_parent:', msg);
				}
			}
			CategoryModel._schemaReady = true;
			CategoryModel._schemaPromise = null;
		})().catch((err) => {
			CategoryModel._schemaPromise = null;
			throw err;
		});

		return CategoryModel._schemaPromise;
	}

	static async getAll(branchId = null) {
		await CategoryModel.ensureSchema();
		let query = `SELECT IDNo, CAT_NAME, CAT_DESC, PARENT_CAT_ID, ACTIVE, ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT FROM categories WHERE ACTIVE = 1`;
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
		await CategoryModel.ensureSchema();
		const { CAT_NAME, CAT_DESC, BRANCH_ID, PARENT_CAT_ID, user_id } = data;
		const branchId = BRANCH_ID != null && BRANCH_ID !== '' ? Number(BRANCH_ID) : null;
		const encodedBy = user_id != null && user_id !== '' ? Number(user_id) : null;
		let parentId = null;
		if (PARENT_CAT_ID != null && PARENT_CAT_ID !== '') {
			const p = Number(PARENT_CAT_ID);
			if (Number.isFinite(p)) {
				const [prows] = await pool.execute(
					`SELECT IDNo, BRANCH_ID, PARENT_CAT_ID FROM categories WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
					[p]
				);
				const pr = prows[0];
				if (!pr) {
					throw new Error('Parent category not found');
				}
				if (Number(pr.BRANCH_ID) !== Number(branchId)) {
					throw new Error('Parent category must belong to the same branch');
				}
				if (pr.PARENT_CAT_ID != null) {
					throw new Error('Subcategories cannot be nested (parent must be a main category)');
				}
				parentId = p;
			}
		}
		const [rows] = await pool.execute('SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM categories');
		const nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
		const now = new Date();

		await pool.execute(
			'INSERT INTO categories (IDNo, BRANCH_ID, CAT_NAME, CAT_DESC, PARENT_CAT_ID, ACTIVE, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
			[nextId, branchId, (String(CAT_NAME || '')).trim(), CAT_DESC || null, parentId, encodedBy, now]
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
		await CategoryModel.ensureSchema();
		const [kids] = await pool.execute(
			`SELECT COUNT(*) AS c FROM categories WHERE PARENT_CAT_ID = ? AND ACTIVE = 1`,
			[id]
		);
		if (Number(kids[0]?.c) > 0) {
			throw new Error('Delete or move subcategories before deleting this main category.');
		}
		const now = new Date();
		const [result] = await pool.execute('UPDATE categories SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?', [user_id, now, id]);
		return result.affectedRows > 0;
	}
}

module.exports = CategoryModel;


const pool = require('../config/db');
const BranchModel = require('./branchModel');
const MasterCategoryModel = require('./masterCategoryModel');

class ExpenseModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (ExpenseModel._schemaReady) return;
		if (ExpenseModel._schemaPromise) return ExpenseModel._schemaPromise;

		ExpenseModel._schemaPromise = (async () => {
			// Parents must exist first so FK creation doesn't fail.
			await BranchModel.ensureSchema();
			await MasterCategoryModel.ensureSchema();

			const createTableWithFk = `
				CREATE TABLE IF NOT EXISTS expenses (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					MASTER_CAT_ID INT NOT NULL,
					EXP_DESC VARCHAR(100) NULL,
					EXP_AMOUNT DECIMAL(12,2) NOT NULL,
					EXP_SOURCE VARCHAR(100) NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY VARCHAR(100) NOT NULL,
					ENCODED_DT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY VARCHAR(100) NULL,
					EDITED_DT TIMESTAMP NULL,
					INDEX idx_expenses_active (ACTIVE),
					INDEX idx_expenses_master_cat_id (MASTER_CAT_ID),
					INDEX idx_expenses_branch (BRANCH_ID),
					INDEX idx_expenses_encoded_dt (ENCODED_DT),
					CONSTRAINT fk_expenses_branch
						FOREIGN KEY (BRANCH_ID) REFERENCES branches(IDNo)
						ON UPDATE CASCADE ON DELETE RESTRICT,
					CONSTRAINT fk_expenses_master_category
						FOREIGN KEY (MASTER_CAT_ID) REFERENCES master_categories(IDNo)
						ON UPDATE CASCADE ON DELETE RESTRICT
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`;

			await pool.execute(createTableWithFk);

			// --- Migration: add ALL missing columns if table existed before they were introduced ---
			try {
				const [cols] = await pool.execute(
					`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses'`
				);
				const existing = new Set(cols.map(c => c.COLUMN_NAME));

				// Each migration is independent with its own try/catch so one failure doesn't block others
				const migrations = [
					{ col: 'MASTER_CAT_ID', sql: `ALTER TABLE expenses ADD COLUMN MASTER_CAT_ID INT NULL` },
					{ col: 'EXP_DESC', sql: `ALTER TABLE expenses ADD COLUMN EXP_DESC VARCHAR(100) NULL` },
					{ col: 'EXP_AMOUNT', sql: `ALTER TABLE expenses ADD COLUMN EXP_AMOUNT DECIMAL(12,2) NULL` },
					{ col: 'EXP_SOURCE', sql: `ALTER TABLE expenses ADD COLUMN EXP_SOURCE VARCHAR(100) NULL` },
					{ col: 'ACTIVE', sql: `ALTER TABLE expenses ADD COLUMN ACTIVE TINYINT(1) NOT NULL DEFAULT 1` },
					{ col: 'ENCODED_BY', sql: `ALTER TABLE expenses ADD COLUMN ENCODED_BY VARCHAR(100) NULL` },
					{ col: 'ENCODED_DT', sql: `ALTER TABLE expenses ADD COLUMN ENCODED_DT TIMESTAMP DEFAULT CURRENT_TIMESTAMP` },
					{ col: 'EDITED_BY', sql: `ALTER TABLE expenses ADD COLUMN EDITED_BY VARCHAR(100) NULL` },
					{ col: 'EDITED_DT', sql: `ALTER TABLE expenses ADD COLUMN EDITED_DT TIMESTAMP NULL` },
					{ col: 'EXP_QTY', sql: `ALTER TABLE expenses ADD COLUMN EXP_QTY DECIMAL(12,3) NULL AFTER EXP_AMOUNT` },
					{ col: 'INGREDIENT_ID', sql: `ALTER TABLE expenses ADD COLUMN INGREDIENT_ID INT NULL AFTER MASTER_CAT_ID` },
				];

				for (const m of migrations) {
					if (!existing.has(m.col)) {
						try {
							await pool.execute(m.sql);
							console.log(`[ExpenseModel] Migration: added ${m.col} column to expenses table`);
						} catch (colErr) {
							console.warn(`[ExpenseModel] Migration warning for ${m.col}:`, colErr.message);
						}
					}
				}
			} catch (migrationErr) {
				console.warn('[ExpenseModel] Migration check warning:', migrationErr.message);
			}

			ExpenseModel._schemaReady = true;
			ExpenseModel._schemaPromise = null;
		})().catch((error) => {
			ExpenseModel._schemaPromise = null;
			throw error;
		});

		return ExpenseModel._schemaPromise;
	}

	static async getAll(branchId = null) {
		await ExpenseModel.ensureSchema();
		// Use JOIN: get oc.NAME as EXP_CAT, mc.CATEGORY_NAME as EXP_NAME (no redundant CATEGORY_TYPE)
		// Include all expenses (STATE 0 and 1) so item names show under Food Supplies etc.
		let query = `
			SELECT
				e.IDNo,
				e.BRANCH_ID,
				b.BRANCH_NAME,
				e.MASTER_CAT_ID,
				e.INGREDIENT_ID,
				e.EXP_DESC,
				e.EXP_AMOUNT,
				e.EXP_QTY,
				e.EXP_SOURCE,
				e.ACTIVE,
				e.ENCODED_BY,
				e.ENCODED_DT,
				e.EDITED_BY,
				e.EDITED_DT,
				mc.IDNo AS MASTER_CATEGORY_ID,
				oc.NAME AS EXP_CAT,
				mc.CATEGORY_NAME AS EXP_NAME,
				mc.ICON AS MASTER_CATEGORY_ICON,
				mc.DESCRIPTION AS MASTER_CATEGORY_DESCRIPTION,
				inv.IDNo AS INVENTORY_ID,
				COALESCE(inv.STOCK_QTY, 0) AS STOCK_QTY,
				COALESCE(ing.UNIT, 'pcs') AS UNIT,
				oc.STATE AS OP_CAT_STATE
			FROM expenses e
			LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
			LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
			LEFT JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
			LEFT JOIN ingredients ing ON ing.ACTIVE = 1 AND ((e.INGREDIENT_ID IS NOT NULL AND ing.IDNo = e.INGREDIENT_ID) OR (e.INGREDIENT_ID IS NULL AND ing.BRANCH_ID = e.BRANCH_ID AND TRIM(ing.NAME) = TRIM(e.EXP_DESC) AND ing.MASTER_CAT_ID <=> e.MASTER_CAT_ID))
			LEFT JOIN (SELECT INGREDIENT_ID, BRANCH_ID, MAX(IDNo) AS IDNo, SUM(STOCK_QTY) AS STOCK_QTY FROM inventory WHERE ACTIVE = 1 AND INGREDIENT_ID IS NOT NULL GROUP BY INGREDIENT_ID, BRANCH_ID) inv ON inv.INGREDIENT_ID = ing.IDNo AND inv.BRANCH_ID = ing.BRANCH_ID
			WHERE e.ACTIVE = 1
		`;
		const params = [];

		if (branchId !== null && branchId !== undefined) {
			query += ` AND e.BRANCH_ID = ?`;
			params.push(Number(branchId));
		}

		query += ` ORDER BY e.IDNo DESC`;
		try {
			const [rows] = await pool.execute(query, params);
			return rows;
		} catch (err) {
			if (err.message && (err.message.includes('EXPENSES_ID') || err.message.includes('INGREDIENT_ID') || err.message.includes('ingredients') || err.message.includes('EXP_QTY') || err.message.includes('Unknown column'))) {
				// Fallback without inventory join
				let fb = `SELECT e.*, b.BRANCH_NAME, mc.IDNo AS MASTER_CATEGORY_ID, oc.NAME AS EXP_CAT, mc.CATEGORY_NAME AS EXP_NAME,
					mc.ICON AS MASTER_CATEGORY_ICON, mc.DESCRIPTION AS MASTER_CATEGORY_DESCRIPTION,
					NULL AS INVENTORY_ID, 0 AS STOCK_QTY, 'pcs' AS UNIT, oc.STATE AS OP_CAT_STATE
					FROM expenses e
					LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
					LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
					LEFT JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
					WHERE e.ACTIVE = 1`;
				const [fbRows] = await pool.execute(fb + (branchId != null ? ' AND e.BRANCH_ID = ?' : '') + ' ORDER BY e.IDNo DESC', params);
				return fbRows;
			}
			throw err;
		}
	}

	static async getById(id) {
		await ExpenseModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				e.IDNo,
				e.BRANCH_ID,
				b.BRANCH_NAME,
				e.MASTER_CAT_ID,
				e.INGREDIENT_ID,
				e.EXP_DESC,
				e.EXP_AMOUNT,
				e.EXP_QTY,
				e.EXP_SOURCE,
				e.ACTIVE,
				e.ENCODED_BY,
				e.ENCODED_DT,
				e.EDITED_BY,
				e.EDITED_DT,
				mc.IDNo AS MASTER_CATEGORY_ID,
				oc.NAME AS EXP_CAT,
				mc.CATEGORY_NAME AS EXP_NAME,
				mc.ICON AS MASTER_CATEGORY_ICON,
				mc.DESCRIPTION AS MASTER_CATEGORY_DESCRIPTION,
				COALESCE(ing.UNIT, 'pcs') AS UNIT,
				oc.STATE AS OP_CAT_STATE
			FROM expenses e
			LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
			LEFT JOIN master_categories mc ON mc.ACTIVE = 1 AND mc.IDNo = e.MASTER_CAT_ID
			LEFT JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1
			LEFT JOIN ingredients ing ON ing.ACTIVE = 1 AND ((e.INGREDIENT_ID IS NOT NULL AND ing.IDNo = e.INGREDIENT_ID) OR (e.INGREDIENT_ID IS NULL AND ing.BRANCH_ID = e.BRANCH_ID AND TRIM(ing.NAME) = TRIM(e.EXP_DESC) AND ing.MASTER_CAT_ID <=> e.MASTER_CAT_ID))
			WHERE e.IDNo = ? AND e.ACTIVE = 1
			LIMIT 1
			`,
			[Number(id)]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await ExpenseModel.ensureSchema();
		const encodedBy = String(data.ENCODED_BY ?? data.user_id ?? 'system').trim() || 'system';
		const masterCatId = Number(data.MASTER_CAT_ID);
		const expQty = data.EXP_QTY != null && Number.isFinite(Number(data.EXP_QTY)) ? Number(data.EXP_QTY) : null;
		const values = [
			Number(data.BRANCH_ID),
			masterCatId,
			data.EXP_DESC || null,
			Number(data.EXP_AMOUNT),
			expQty,
			data.EXP_SOURCE || null,
			encodedBy,
		];
		try {
			const [result] = await pool.execute(
				`
				INSERT INTO expenses (
					BRANCH_ID,
					MASTER_CAT_ID,
					EXP_DESC,
					EXP_AMOUNT,
					EXP_QTY,
					EXP_SOURCE,
					ACTIVE,
					ENCODED_BY,
					ENCODED_DT
				) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
				`,
				values
			);
			return result.insertId;
		} catch (err) {
			const msg = String(err.message || '');
			if (msg.includes('IDNo') && msg.includes('default')) {
				const [rows] = await pool.execute(
					`SELECT COALESCE(MAX(IDNo), 0) + 1 AS nextId FROM expenses`
				);
				const nextId = Number(rows[0]?.nextId ?? rows[0]?.nextid ?? 1) || 1;
				await pool.execute(
					`
					INSERT INTO expenses (
						IDNo,
						BRANCH_ID,
						MASTER_CAT_ID,
						EXP_DESC,
						EXP_AMOUNT,
						EXP_QTY,
						EXP_SOURCE,
						ACTIVE,
						ENCODED_BY,
						ENCODED_DT
					) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
					`,
					[nextId, ...values]
				);
				return nextId;
			}
			if (msg.includes('EXP_QTY') || msg.includes('Unknown column')) {
				// Fallback when EXP_QTY column doesn't exist yet
				const valuesNoQty = [Number(data.BRANCH_ID), masterCatId, data.EXP_DESC || null, Number(data.EXP_AMOUNT), data.EXP_SOURCE || null, encodedBy];
				const [result] = await pool.execute(
					`INSERT INTO expenses (BRANCH_ID, MASTER_CAT_ID, EXP_DESC, EXP_AMOUNT, EXP_SOURCE, ACTIVE, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
					valuesNoQty
				);
				return result.insertId;
			}
			throw err;
		}
	}

	static async update(id, data) {
		await ExpenseModel.ensureSchema();
		const expQty = data.EXP_QTY != null && Number.isFinite(Number(data.EXP_QTY)) ? Number(data.EXP_QTY) : null;
		try {
			const [result] = await pool.execute(
				`
				UPDATE expenses
				SET
					MASTER_CAT_ID = ?,
					EXP_DESC = ?,
					EXP_AMOUNT = ?,
					EXP_QTY = ?,
					EXP_SOURCE = ?,
					EDITED_BY = ?,
					EDITED_DT = CURRENT_TIMESTAMP
				WHERE IDNo = ? AND ACTIVE = 1
				`,
				[
					Number(data.MASTER_CAT_ID),
					data.EXP_DESC || null,
					Number(data.EXP_AMOUNT),
					expQty,
					data.EXP_SOURCE || null,
					String(data.user_id ?? data.EDITED_BY ?? '').trim() || null,
					Number(id),
				]
			);
			return result.affectedRows > 0;
		} catch (err) {
			if (err.message && (err.message.includes('EXP_QTY') || err.message.includes('Unknown column'))) {
				const [result] = await pool.execute(
					`UPDATE expenses SET MASTER_CAT_ID = ?, EXP_DESC = ?, EXP_AMOUNT = ?, EXP_SOURCE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`,
					[Number(data.MASTER_CAT_ID), data.EXP_DESC || null, Number(data.EXP_AMOUNT), data.EXP_SOURCE || null, String(data.user_id ?? data.EDITED_BY ?? '').trim() || null, Number(id)]
				);
				return result.affectedRows > 0;
			}
			throw err;
		}
	}

	static async delete(id, userId = null) {
		await ExpenseModel.ensureSchema();
		const [result] = await pool.execute(
			`
			UPDATE expenses
			SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1
			`,
			[userId ? String(userId) : null, Number(id)]
		);
		return result.affectedRows > 0;
	}

	static _buildReportFilters(filters = {}) {
		const where = ['e.ACTIVE = 1'];
		const params = [];

		if (filters.branchId !== null && filters.branchId !== undefined) {
			where.push('e.BRANCH_ID = ?');
			params.push(Number(filters.branchId));
		}

		if (filters.categoryType) {
			where.push('mc.CATEGORY_TYPE = ?');
			params.push(String(filters.categoryType));
		}

		if (filters.categoryName) {
			where.push('mc.CATEGORY_NAME = ?');
			params.push(String(filters.categoryName));
		}

		if (filters.dateFrom) {
			where.push('DATE(e.ENCODED_DT) >= ?');
			params.push(String(filters.dateFrom));
		}

		if (filters.dateTo) {
			where.push('DATE(e.ENCODED_DT) <= ?');
			params.push(String(filters.dateTo));
		}

		if (filters.search && String(filters.search).trim()) {
			where.push('(mc.CATEGORY_TYPE LIKE ? OR mc.CATEGORY_NAME LIKE ? OR e.EXP_DESC LIKE ? OR e.EXP_SOURCE LIKE ?)');
			const like = `%${String(filters.search).trim()}%`;
			params.push(like, like, like, like);
		}

		return { whereSql: where.join(' AND '), params };
	}

	static async getSummary(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildReportFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_expense,
				COALESCE(SUM(CASE WHEN DATE_FORMAT(e.ENCODED_DT, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN e.EXP_AMOUNT ELSE 0 END), 0) AS current_month_expense
			FROM expenses e
			LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
			WHERE ${whereSql}
			`,
			params
		);
		return rows[0] || { total_expense: 0, current_month_expense: 0 };
	}

	static async getCategoryBreakdown(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildReportFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				mc.CATEGORY_TYPE AS EXP_CAT,
				mc.CATEGORY_NAME AS EXP_NAME,
				COUNT(*) AS entry_count,
				COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_amount
			FROM expenses e
			LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
			WHERE ${whereSql}
			GROUP BY mc.CATEGORY_TYPE, mc.CATEGORY_NAME
			ORDER BY total_amount DESC, mc.CATEGORY_TYPE ASC, mc.CATEGORY_NAME ASC
			`,
			params
		);
		return rows;
	}

	static async getTrend(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildReportFilters(filters);
		const groupBy =
			filters.period === 'daily'
				? "DATE_FORMAT(e.ENCODED_DT, '%Y-%m-%d')"
				: "DATE_FORMAT(e.ENCODED_DT, '%Y-%m')";
		const [rows] = await pool.execute(
			`
			SELECT
				${groupBy} AS period,
				COALESCE(SUM(e.EXP_AMOUNT), 0) AS total_amount
			FROM expenses e
			LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
			WHERE ${whereSql}
			GROUP BY period
			ORDER BY period ASC
			`,
			params
		);
		return rows;
	}

	static async getExportRows(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildReportFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				e.IDNo,
				e.BRANCH_ID,
				b.BRANCH_NAME,
				mc.CATEGORY_TYPE AS EXP_CAT,
				mc.CATEGORY_NAME AS EXP_NAME,
				e.EXP_DESC,
				e.EXP_AMOUNT,
				e.EXP_SOURCE,
				e.ENCODED_BY,
				e.ENCODED_DT
			FROM expenses e
			LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
			LEFT JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
			WHERE ${whereSql}
			ORDER BY e.IDNo DESC
			`,
			params
		);
		return rows;
	}
}

module.exports = ExpenseModel;


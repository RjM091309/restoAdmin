const pool = require('../config/db');

class ExpenseModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (ExpenseModel._schemaReady) return;
		if (ExpenseModel._schemaPromise) return ExpenseModel._schemaPromise;

		ExpenseModel._schemaPromise = (async () => {
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS expenses (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					EXPENSE_DATE DATE NOT NULL,
					CATEGORY VARCHAR(120) NOT NULL,
					SOURCE_TYPE VARCHAR(80) NOT NULL DEFAULT 'manual',
					SOURCE_REF_ID VARCHAR(120) NULL,
					DESCRIPTION TEXT NULL,
					AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
					IS_AUTO TINYINT(1) NOT NULL DEFAULT 0,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					UNIQUE KEY uq_expense_source (SOURCE_TYPE, SOURCE_REF_ID, BRANCH_ID),
					INDEX idx_expenses_branch_date (BRANCH_ID, EXPENSE_DATE),
					INDEX idx_expenses_category (CATEGORY),
					INDEX idx_expenses_auto (IS_AUTO),
					INDEX idx_expenses_active (ACTIVE)
				)
			`);

			ExpenseModel._schemaReady = true;
		})().catch((error) => {
			ExpenseModel._schemaPromise = null;
			throw error;
		});

		return ExpenseModel._schemaPromise;
	}

	static _normalizeNumber(value, fallback = 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	static _normalizeAmount(value) {
		const parsed = ExpenseModel._normalizeNumber(value, 0);
		return parsed < 0 ? 0 : parsed;
	}

	static _normalizeDate(value) {
		if (!value) return new Date().toISOString().slice(0, 10);
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
		return date.toISOString().slice(0, 10);
	}

	static _buildFilters(filters = {}) {
		const where = ['e.ACTIVE = 1'];
		const params = [];

		if (filters.branchId !== null && filters.branchId !== undefined) {
			where.push('e.BRANCH_ID = ?');
			params.push(Number(filters.branchId));
		}

		if (filters.category) {
			where.push('e.CATEGORY = ?');
			params.push(String(filters.category));
		}

		if (filters.sourceType) {
			where.push('e.SOURCE_TYPE = ?');
			params.push(String(filters.sourceType));
		}

		if (filters.isAuto !== null && filters.isAuto !== undefined) {
			where.push('e.IS_AUTO = ?');
			params.push(filters.isAuto ? 1 : 0);
		}

		if (filters.dateFrom) {
			where.push('e.EXPENSE_DATE >= ?');
			params.push(String(filters.dateFrom));
		}

		if (filters.dateTo) {
			where.push('e.EXPENSE_DATE <= ?');
			params.push(String(filters.dateTo));
		}

		if (filters.search && String(filters.search).trim()) {
			where.push('(e.CATEGORY LIKE ? OR e.DESCRIPTION LIKE ?)');
			const like = `%${String(filters.search).trim()}%`;
			params.push(like, like);
		}

		return { whereSql: where.join(' AND '), params };
	}

	static async getAll(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				e.IDNo,
				e.BRANCH_ID,
				b.BRANCH_NAME,
				e.EXPENSE_DATE,
				e.CATEGORY,
				e.SOURCE_TYPE,
				e.SOURCE_REF_ID,
				e.DESCRIPTION,
				e.AMOUNT,
				e.IS_AUTO,
				e.ENCODED_BY,
				CONCAT(COALESCE(ui.FIRSTNAME, ''), CASE WHEN ui.LASTNAME IS NOT NULL AND ui.LASTNAME <> '' THEN CONCAT(' ', ui.LASTNAME) ELSE '' END) AS ENCODED_BY_NAME,
				e.ENCODED_DT,
				e.EDITED_BY,
				e.EDITED_DT
			FROM expenses e
			LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
			LEFT JOIN user_info ui ON ui.IDNo = e.ENCODED_BY
			WHERE ${whereSql}
			ORDER BY e.EXPENSE_DATE DESC, e.IDNo DESC
			`,
			params
		);
		return rows;
	}

	static async getById(id) {
		await ExpenseModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				IDNo,
				BRANCH_ID,
				EXPENSE_DATE,
				CATEGORY,
				SOURCE_TYPE,
				SOURCE_REF_ID,
				DESCRIPTION,
				AMOUNT,
				IS_AUTO,
				ACTIVE
			FROM expenses
			WHERE IDNo = ?
			LIMIT 1
			`,
			[id]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await ExpenseModel.ensureSchema();
		const [result] = await pool.execute(
			`
			INSERT INTO expenses (
				BRANCH_ID,
				EXPENSE_DATE,
				CATEGORY,
				SOURCE_TYPE,
				SOURCE_REF_ID,
				DESCRIPTION,
				AMOUNT,
				IS_AUTO,
				ENCODED_BY
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			[
				Number(data.BRANCH_ID),
				ExpenseModel._normalizeDate(data.EXPENSE_DATE),
				String(data.CATEGORY || 'Other'),
				String(data.SOURCE_TYPE || 'manual'),
				data.SOURCE_REF_ID || null,
				data.DESCRIPTION || null,
				ExpenseModel._normalizeAmount(data.AMOUNT),
				data.IS_AUTO ? 1 : 0,
				data.user_id || null,
			]
		);
		return result.insertId;
	}

	static async update(id, data) {
		await ExpenseModel.ensureSchema();
		const [result] = await pool.execute(
			`
			UPDATE expenses
			SET
				EXPENSE_DATE = ?,
				CATEGORY = ?,
				DESCRIPTION = ?,
				AMOUNT = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1 AND IS_AUTO = 0
			`,
			[
				ExpenseModel._normalizeDate(data.EXPENSE_DATE),
				String(data.CATEGORY || 'Other'),
				data.DESCRIPTION || null,
				ExpenseModel._normalizeAmount(data.AMOUNT),
				data.user_id || null,
				Number(id),
			]
		);
		return result.affectedRows > 0;
	}

	static async delete(id, userId) {
		await ExpenseModel.ensureSchema();
		const [result] = await pool.execute(
			`
			UPDATE expenses
			SET
				ACTIVE = 0,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1 AND IS_AUTO = 0
			`,
			[userId || null, Number(id)]
		);
		return result.affectedRows > 0;
	}

	static async upsertAutoExpense(payload) {
		await ExpenseModel.ensureSchema();
		await pool.execute(
			`
			INSERT INTO expenses (
				BRANCH_ID,
				EXPENSE_DATE,
				CATEGORY,
				SOURCE_TYPE,
				SOURCE_REF_ID,
				DESCRIPTION,
				AMOUNT,
				IS_AUTO,
				ACTIVE,
				ENCODED_BY
			) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
			ON DUPLICATE KEY UPDATE
				EXPENSE_DATE = VALUES(EXPENSE_DATE),
				CATEGORY = VALUES(CATEGORY),
				DESCRIPTION = VALUES(DESCRIPTION),
				AMOUNT = VALUES(AMOUNT),
				IS_AUTO = 1,
				ACTIVE = 1,
				EDITED_BY = VALUES(ENCODED_BY),
				EDITED_DT = CURRENT_TIMESTAMP
			`,
			[
				Number(payload.branchId),
				ExpenseModel._normalizeDate(payload.expenseDate),
				String(payload.category || 'Inventory'),
				String(payload.sourceType),
				String(payload.sourceRefId),
				payload.description || null,
				ExpenseModel._normalizeAmount(payload.amount),
				payload.userId || null,
			]
		);
	}

	static async disableAutoExpense(sourceType, sourceRefId, userId = null) {
		await ExpenseModel.ensureSchema();
		await pool.execute(
			`
			UPDATE expenses
			SET
				ACTIVE = 0,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE SOURCE_TYPE = ? AND SOURCE_REF_ID = ? AND IS_AUTO = 1 AND ACTIVE = 1
			`,
			[userId, String(sourceType), String(sourceRefId)]
		);
	}

	static async getSummary(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				COALESCE(SUM(e.AMOUNT), 0) AS total_expense,
				COALESCE(SUM(CASE WHEN e.IS_AUTO = 1 THEN e.AMOUNT ELSE 0 END), 0) AS auto_expense,
				COALESCE(SUM(CASE WHEN e.IS_AUTO = 0 THEN e.AMOUNT ELSE 0 END), 0) AS manual_expense,
				COALESCE(SUM(CASE WHEN DATE_FORMAT(e.EXPENSE_DATE, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN e.AMOUNT ELSE 0 END), 0) AS current_month_expense
			FROM expenses e
			WHERE ${whereSql}
			`,
			params
		);
		return rows[0] || {
			total_expense: 0,
			auto_expense: 0,
			manual_expense: 0,
			current_month_expense: 0,
		};
	}

	static async getCategoryBreakdown(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				e.CATEGORY,
				COUNT(*) AS entry_count,
				COALESCE(SUM(e.AMOUNT), 0) AS total_amount
			FROM expenses e
			WHERE ${whereSql}
			GROUP BY e.CATEGORY
			ORDER BY total_amount DESC, e.CATEGORY ASC
			`,
			params
		);
		return rows;
	}

	static async getTrend(filters = {}) {
		await ExpenseModel.ensureSchema();
		const { whereSql, params } = ExpenseModel._buildFilters(filters);
		const groupBy = filters.period === 'daily' ? 'DATE_FORMAT(e.EXPENSE_DATE, \'%Y-%m-%d\')' : 'DATE_FORMAT(e.EXPENSE_DATE, \'%Y-%m\')';
		const [rows] = await pool.execute(
			`
			SELECT
				${groupBy} AS period,
				COALESCE(SUM(e.AMOUNT), 0) AS total_amount
			FROM expenses e
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
		const { whereSql, params } = ExpenseModel._buildFilters(filters);
		const [rows] = await pool.execute(
			`
			SELECT
				e.IDNo,
				e.EXPENSE_DATE,
				e.CATEGORY,
				e.SOURCE_TYPE,
				e.DESCRIPTION,
				e.AMOUNT,
				e.IS_AUTO,
				b.BRANCH_NAME
			FROM expenses e
			LEFT JOIN branches b ON b.IDNo = e.BRANCH_ID
			WHERE ${whereSql}
			ORDER BY e.EXPENSE_DATE DESC, e.IDNo DESC
			`,
			params
		);
		return rows;
	}
}

module.exports = ExpenseModel;

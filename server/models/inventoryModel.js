const pool = require('../config/db');

class InventoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (InventoryModel._schemaReady) return;
		if (InventoryModel._schemaPromise) return InventoryModel._schemaPromise;

		InventoryModel._schemaPromise = (async () => {
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					ITEM_NAME VARCHAR(120) NOT NULL,
					CATEGORY_ID INT NULL,
					CATEGORY_NAME VARCHAR(120) NULL,
					STOCK_QTY DECIMAL(12,3) NOT NULL DEFAULT 0,
					UNIT VARCHAR(20) NOT NULL DEFAULT 'pcs',
					UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0,
					REORDER_LEVEL DECIMAL(12,3) NOT NULL DEFAULT 0,
					STATUS_FLAG VARCHAR(20) NOT NULL DEFAULT 'In Stock',
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_branch (BRANCH_ID),
					INDEX idx_inventory_category (CATEGORY_ID),
					INDEX idx_inventory_active (ACTIVE)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_unit_cost_history (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					INVENTORY_ID INT NOT NULL,
					BRANCH_ID INT NOT NULL,
					OLD_UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0,
					NEW_UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0,
					CHANGE_TYPE VARCHAR(20) NOT NULL DEFAULT 'INITIAL',
					CHANGED_BY INT NULL,
					CHANGED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
					INDEX idx_inventory_cost_history_inventory (INVENTORY_ID),
					INDEX idx_inventory_cost_history_branch (BRANCH_ID),
					INDEX idx_inventory_cost_history_changed_at (CHANGED_AT)
				)
			`);

			const [unitCostColumn] = await pool.execute(
				`SELECT 1
				 FROM INFORMATION_SCHEMA.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE()
				   AND TABLE_NAME = 'inventory'
				   AND COLUMN_NAME = 'UNIT_COST'
				 LIMIT 1`
			);
			if (!unitCostColumn.length) {
				await pool.execute(
					`ALTER TABLE inventory
					 ADD COLUMN UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER UNIT`
				);
			}

			const [branchIdColumn] = await pool.execute(
				`SELECT 1
				 FROM INFORMATION_SCHEMA.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE()
				   AND TABLE_NAME = 'inventory'
				   AND COLUMN_NAME = 'BRANCH_ID'
				 LIMIT 1`
			);
			if (!branchIdColumn.length) {
				await pool.execute(
					`ALTER TABLE inventory
					 ADD COLUMN BRANCH_ID INT NOT NULL DEFAULT 1 AFTER IDNo`
				);
			}

			const [itemCodeColumn] = await pool.execute(
				`SELECT 1
				 FROM INFORMATION_SCHEMA.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE()
				   AND TABLE_NAME = 'inventory'
				   AND COLUMN_NAME = 'ITEM_CODE'
				 LIMIT 1`
			);
			if (itemCodeColumn.length) {
				const [itemCodeIndex] = await pool.execute(
					`SELECT 1
					 FROM INFORMATION_SCHEMA.STATISTICS
					 WHERE TABLE_SCHEMA = DATABASE()
					   AND TABLE_NAME = 'inventory'
					   AND INDEX_NAME = 'uk_inventory_branch_item_code'
					 LIMIT 1`
				);
				if (itemCodeIndex.length) {
					await pool.execute(`ALTER TABLE inventory DROP INDEX uk_inventory_branch_item_code`);
				}
				await pool.execute(`ALTER TABLE inventory DROP COLUMN ITEM_CODE`);
			}

			// Add EXPENSES_ID to link inventory to expenses (item name from expense)
			const [expensesIdColumn] = await pool.execute(
				`SELECT 1
				 FROM INFORMATION_SCHEMA.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE()
				   AND TABLE_NAME = 'inventory'
				   AND COLUMN_NAME = 'EXPENSES_ID'
				 LIMIT 1`
			);
			if (!expensesIdColumn.length) {
				await pool.execute(
					`ALTER TABLE inventory ADD COLUMN EXPENSES_ID INT NULL AFTER BRANCH_ID,
					 ADD INDEX idx_inventory_expenses (EXPENSES_ID)`
				);
				console.log('[InventoryModel] Added EXPENSES_ID column to inventory');
			}

			try {
				const [legacyTable] = await pool.execute(
					`SELECT 1
					 FROM INFORMATION_SCHEMA.TABLES
					 WHERE TABLE_SCHEMA = DATABASE()
					   AND TABLE_NAME = 'master_inventory'
					 LIMIT 1`
				);
				if (legacyTable.length) {
					await pool.execute(`
						INSERT INTO inventory (
							IDNo, BRANCH_ID, ITEM_NAME, CATEGORY_ID, CATEGORY_NAME,
							STOCK_QTY, UNIT, UNIT_COST, REORDER_LEVEL, STATUS_FLAG, ACTIVE,
							ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
						)
						SELECT
							mi.IDNo, mi.BRANCH_ID, mi.ITEM_NAME, mi.CATEGORY_ID, mi.CATEGORY_NAME,
							mi.STOCK_QTY, mi.UNIT, COALESCE(mi.UNIT_COST, 0), mi.REORDER_LEVEL, mi.STATUS_FLAG, mi.ACTIVE,
							mi.ENCODED_BY, mi.ENCODED_DT, mi.EDITED_BY, mi.EDITED_DT
						FROM master_inventory mi
						LEFT JOIN inventory i ON i.IDNo = mi.IDNo
						WHERE i.IDNo IS NULL
					`);
				}
			} catch (legacyErr) {
				console.warn('[InventoryModel] master_inventory migration skipped:', legacyErr?.message);
			}

			try {
				await pool.execute(`
					INSERT INTO inventory_unit_cost_history (
						INVENTORY_ID, BRANCH_ID, OLD_UNIT_COST, NEW_UNIT_COST, CHANGE_TYPE, CHANGED_BY, CHANGED_AT
					)
					SELECT
						i.IDNo,
						i.BRANCH_ID,
						COALESCE(i.UNIT_COST, 0),
						COALESCE(i.UNIT_COST, 0),
						'INITIAL',
						i.ENCODED_BY,
						COALESCE(i.ENCODED_DT, CURRENT_TIMESTAMP)
					FROM inventory i
					LEFT JOIN inventory_unit_cost_history h
						ON h.INVENTORY_ID = i.IDNo
					WHERE h.IDNo IS NULL
				`);
			} catch (historyErr) {
				// Backfill may fail if inventory table has different schema (e.g. missing BRANCH_ID)
				console.warn('[InventoryModel] inventory_unit_cost_history backfill skipped:', historyErr?.message);
			}

			// Populate inventory from expenses (inventory categories only) when inventory is empty
			try {
				const [invCols] = await pool.execute(
					`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory'`
				);
				const hasExpensesId = invCols.some((c) => c.COLUMN_NAME === 'EXPENSES_ID');
				if (hasExpensesId) {
					const [count] = await pool.execute(`SELECT COUNT(*) AS n FROM inventory WHERE ACTIVE = 1`);
					if (Number(count[0]?.n ?? 0) === 0) {
						await pool.execute(`
							INSERT INTO inventory (
								BRANCH_ID, EXPENSES_ID, STOCK_QTY, UNIT, UNIT_COST, REORDER_LEVEL,
								STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
							)
							SELECT
								e.BRANCH_ID, e.IDNo, 0, 'pcs', COALESCE(e.EXP_AMOUNT, 0), 0,
								'In Stock', 1, e.ENCODED_BY, e.ENCODED_DT, e.EDITED_BY, e.EDITED_DT
							FROM expenses e
							INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID AND mc.ACTIVE = 1
							INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1 AND oc.STATE = 1
							LEFT JOIN inventory inv ON inv.EXPENSES_ID = e.IDNo AND inv.ACTIVE = 1
							WHERE inv.IDNo IS NULL
						`);
						console.log('[InventoryModel] Populated inventory from expenses (inventory categories)');
					}
				}
			} catch (popErr) {
				console.warn('[InventoryModel] Populate from expenses skipped:', popErr?.message);
			}

			InventoryModel._schemaReady = true;
			InventoryModel._schemaPromise = null;
		})();

		return InventoryModel._schemaPromise;
	}

	static async getAll(branchId = null, categoryId = null) {
		await InventoryModel.ensureSchema();
		// Base: expenses under inventory categories. LEFT JOIN inventory for stock.
		// Shows ALL items (even 0 stock) - inventory row optional
		const params = [];
		let where = 'WHERE 1=1';
		if (branchId != null && branchId !== undefined) {
			where += ' AND e.BRANCH_ID = ?';
			params.push(branchId);
		}
		if (categoryId != null && categoryId !== undefined && String(categoryId).trim() !== '') {
			where += ' AND e.MASTER_CAT_ID = ?';
			params.push(Number(categoryId) || categoryId);
		}
		const query = `
			SELECT
				COALESCE(i.IDNo, e.IDNo) AS IDNo,
				e.BRANCH_ID,
				e.EXP_DESC AS ITEM_NAME,
				e.MASTER_CAT_ID AS CATEGORY_ID,
				mc.CATEGORY_NAME AS CATEGORY_NAME,
				COALESCE(i.STOCK_QTY, 0) AS STOCK_QTY,
				COALESCE(i.UNIT, 'pcs') AS UNIT,
				COALESCE(i.UNIT_COST, e.EXP_AMOUNT, 0) AS UNIT_COST,
				COALESCE(i.REORDER_LEVEL, 0) AS REORDER_LEVEL,
				COALESCE(i.STATUS_FLAG, 'In Stock') AS STATUS_FLAG,
				1 AS ACTIVE,
				e.ENCODED_BY,
				e.ENCODED_DT,
				e.EDITED_BY,
				e.EDITED_DT
			FROM expenses e
			INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID AND mc.ACTIVE = 1
			INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1 AND oc.STATE = 1
			LEFT JOIN inventory i ON i.EXPENSES_ID = e.IDNo AND i.ACTIVE = 1
			${where}
			ORDER BY e.IDNo DESC
		`;
		try {
			const [rows] = await pool.execute(query, params);
			return rows;
		} catch (err) {
			if (err.message && (err.message.includes('EXPENSES_ID') || err.message.includes('Unknown column') || err.message.includes("doesn't exist"))) {
				// Fallback: expenses only (no inventory join) - shows all items even with 0 stock
				const fbWhere = [
					branchId != null && branchId !== undefined ? 'e.BRANCH_ID = ?' : null,
					categoryId != null && String(categoryId).trim() !== '' ? 'e.MASTER_CAT_ID = ?' : null,
				].filter(Boolean).join(' AND ');
				const [fbRows] = await pool.execute(
					`SELECT e.IDNo, e.BRANCH_ID, e.EXP_DESC AS ITEM_NAME, e.MASTER_CAT_ID AS CATEGORY_ID,
						mc.CATEGORY_NAME AS CATEGORY_NAME, 0 AS STOCK_QTY, 'pcs' AS UNIT,
						COALESCE(e.EXP_AMOUNT, 0) AS UNIT_COST, 0 AS REORDER_LEVEL, 'In Stock' AS STATUS_FLAG,
						1 AS ACTIVE, e.ENCODED_BY, e.ENCODED_DT, e.EDITED_BY, e.EDITED_DT
					FROM expenses e
					INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID AND mc.ACTIVE = 1
					INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1 AND oc.STATE = 1
					${fbWhere ? `WHERE ${fbWhere}` : ''}
					ORDER BY e.IDNo DESC`,
					params
				);
				return fbRows;
			}
			throw err;
		}
	}

	static async getById(id) {
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(`SELECT * FROM inventory WHERE IDNo = ? AND ACTIVE = 1`, [id]);
		return rows[0] || null;
	}

	static async create(data) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		const parsedUnitCost = Number(data.UNIT_COST || 0);
		// Store only FK: CATEGORY_ID or EXPENSES_ID - name comes from join
		const [result] = await pool.execute(
			`INSERT INTO inventory (
				BRANCH_ID,
				ITEM_NAME,
				CATEGORY_ID,
				STOCK_QTY,
				UNIT,
				UNIT_COST,
				REORDER_LEVEL,
				STATUS_FLAG,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			[
				Number(data.BRANCH_ID),
				String(data.ITEM_NAME || '').trim(),
				data.CATEGORY_ID ? Number(data.CATEGORY_ID) : null,
				Number(data.STOCK_QTY || 0),
				String(data.UNIT || 'pcs'),
				parsedUnitCost,
				Number(data.REORDER_LEVEL || 0),
				String(data.STATUS_FLAG || 'In Stock'),
				data.user_id || null,
				currentDate,
			]
		);

		await pool.execute(
			`INSERT INTO inventory_unit_cost_history (
				INVENTORY_ID, BRANCH_ID, OLD_UNIT_COST, NEW_UNIT_COST, CHANGE_TYPE, CHANGED_BY, CHANGED_AT
			) VALUES (?, ?, ?, ?, 'INITIAL', ?, ?)`,
			[
				result.insertId,
				Number(data.BRANCH_ID),
				parsedUnitCost,
				parsedUnitCost,
				data.user_id || null,
				currentDate,
			]
		);
		return result.insertId;
	}

	static async update(id, data) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		const [existingRows] = await pool.execute(
			`SELECT BRANCH_ID, UNIT_COST FROM inventory WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
			[id]
		);
		if (!existingRows.length) return false;
		const existing = existingRows[0];
		const oldUnitCost = Number(existing.UNIT_COST || 0);
		const newUnitCost = Number(data.UNIT_COST || 0);

		const [result] = await pool.execute(
			`UPDATE inventory
			SET ITEM_NAME = ?,
				CATEGORY_ID = ?,
				STOCK_QTY = ?,
				UNIT = ?,
				UNIT_COST = ?,
				REORDER_LEVEL = ?,
				STATUS_FLAG = ?,
				EDITED_BY = ?,
				EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[
				String(data.ITEM_NAME || '').trim(),
				data.CATEGORY_ID ? Number(data.CATEGORY_ID) : null,
				Number(data.STOCK_QTY || 0),
				String(data.UNIT || 'pcs'),
				Number(data.UNIT_COST || 0),
				Number(data.REORDER_LEVEL || 0),
				String(data.STATUS_FLAG || 'In Stock'),
				data.user_id || null,
				currentDate,
				id,
			]
		);
		if (result.affectedRows > 0 && oldUnitCost !== newUnitCost) {
			const changeType = newUnitCost > oldUnitCost ? 'INCREASE' : 'DECREASE';
			await pool.execute(
				`INSERT INTO inventory_unit_cost_history (
					INVENTORY_ID, BRANCH_ID, OLD_UNIT_COST, NEW_UNIT_COST, CHANGE_TYPE, CHANGED_BY, CHANGED_AT
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					id,
					Number(existing.BRANCH_ID),
					oldUnitCost,
					newUnitCost,
					changeType,
					data.user_id || null,
					currentDate,
				]
			);
		}
		return result.affectedRows > 0;
	}

	static async delete(id, userId = null) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		const [result] = await pool.execute(
			`UPDATE inventory
			SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[userId, currentDate, id]
		);
		return result.affectedRows > 0;
	}

	static async updateStockByExpenseId(expenseId, stockQty, branchId = null) {
		await InventoryModel.ensureSchema();
		const qty = Number(stockQty);
		if (!Number.isFinite(qty) || qty < 0) return false;
		try {
			const [rows] = await pool.execute(
				`SELECT i.IDNo, i.BRANCH_ID FROM inventory i WHERE i.EXPENSES_ID = ? AND i.ACTIVE = 1 LIMIT 1`,
				[expenseId]
			);
			if (rows.length) {
				const [result] = await pool.execute(
					`UPDATE inventory SET STOCK_QTY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE EXPENSES_ID = ? AND ACTIVE = 1`,
					[qty, expenseId]
				);
				return result.affectedRows > 0;
			}
			// Create inventory from expense if not exists (inventory category)
			const [exp] = await pool.execute(
				`SELECT e.BRANCH_ID, e.EXP_DESC, e.EXP_AMOUNT, e.MASTER_CAT_ID, e.ENCODED_BY, e.ENCODED_DT
				 FROM expenses e
				 INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
				 INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.STATE = 1
				 WHERE e.IDNo = ? LIMIT 1`,
				[expenseId]
			);
			if (exp.length) {
				const brId = branchId ?? exp[0].BRANCH_ID ?? 1;
				await pool.execute(
					`INSERT INTO inventory (BRANCH_ID, EXPENSES_ID, STOCK_QTY, UNIT, UNIT_COST, REORDER_LEVEL, STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT)
					 VALUES (?, ?, ?, 'pcs', COALESCE(?, 0), 0, 'In Stock', 1, ?, ?)`,
					[brId, expenseId, qty, exp[0].EXP_AMOUNT, exp[0].ENCODED_BY, exp[0].ENCODED_DT]
				);
				return true;
			}
			return false;
		} catch (err) {
			if (err.message && err.message.includes('EXPENSES_ID')) return false;
			throw err;
		}
	}
}

module.exports = InventoryModel;

InventoryModel.ensureSchema().catch((error) => {
	console.error('[INVENTORY MODEL] Failed to ensure schema:', error.message);
});

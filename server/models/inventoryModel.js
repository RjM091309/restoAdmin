const pool = require('../config/db');
const IngredientModel = require('./ingredientModel');

class InventoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (InventoryModel._schemaReady) return;
		if (InventoryModel._schemaPromise) return InventoryModel._schemaPromise;

		InventoryModel._schemaPromise = (async () => {
			await IngredientModel.ensureSchema();

			// Create inventory with minimal schema: IDNo, BRANCH_ID, INGREDIENT_ID, STOCK_QTY, STATUS_FLAG, ACTIVE, ENCODED_*, EDITED_*
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					INGREDIENT_ID INT NULL,
					STOCK_QTY DECIMAL(12,3) NOT NULL DEFAULT 0,
					STATUS_FLAG VARCHAR(20) NOT NULL DEFAULT 'In Stock',
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_branch (BRANCH_ID),
					INDEX idx_inventory_ingredient (INGREDIENT_ID),
					INDEX idx_inventory_active (ACTIVE)
				)
			`);

			// Migration: add INGREDIENT_ID if missing (legacy tables)
			const [invCols] = await pool.execute(
				`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory'`
			);
			const colSet = new Set(invCols.map((c) => c.COLUMN_NAME));

			if (!colSet.has('INGREDIENT_ID')) {
				await pool.execute(
					`ALTER TABLE inventory ADD COLUMN INGREDIENT_ID INT NULL AFTER BRANCH_ID, ADD INDEX idx_inventory_ingredient (INGREDIENT_ID)`
				);
				console.log('[InventoryModel] Added INGREDIENT_ID');
			}

			// Migration: set INGREDIENT_ID from EXPENSES_ID (if EXPENSES_ID exists)
			if (colSet.has('EXPENSES_ID')) {
				try {
					const [upd] = await pool.execute(`
						UPDATE inventory i
						INNER JOIN expenses e ON e.IDNo = i.EXPENSES_ID AND e.ACTIVE = 1
						INNER JOIN ingredients ing ON ing.BRANCH_ID = i.BRANCH_ID
						  AND TRIM(ing.NAME) = TRIM(e.EXP_DESC)
						  AND ing.MASTER_CAT_ID <=> e.MASTER_CAT_ID
						  AND ing.ACTIVE = 1
						SET i.INGREDIENT_ID = ing.IDNo
						WHERE i.EXPENSES_ID IS NOT NULL AND i.ACTIVE = 1 AND i.INGREDIENT_ID IS NULL
					`);
					if (upd.affectedRows > 0) console.log(`[InventoryModel] Migrated ${upd.affectedRows} rows to INGREDIENT_ID`);
				} catch (e) {
					console.warn('[InventoryModel] INGREDIENT_ID migration:', e?.message);
				}
			}

			// Migration: copy UNIT_COST, REORDER_LEVEL from inventory to ingredients before dropping
			if (colSet.has('UNIT_COST') || colSet.has('REORDER_LEVEL')) {
				try {
					await pool.execute(`
						UPDATE ingredients ing
						INNER JOIN (
							SELECT INGREDIENT_ID, MAX(UNIT_COST) AS UNIT_COST, MAX(REORDER_LEVEL) AS REORDER_LEVEL
							FROM inventory WHERE ACTIVE = 1 AND INGREDIENT_ID IS NOT NULL
							GROUP BY INGREDIENT_ID
						) agg ON agg.INGREDIENT_ID = ing.IDNo
						SET ing.UNIT_COST = COALESCE(agg.UNIT_COST, 0), ing.REORDER_LEVEL = COALESCE(agg.REORDER_LEVEL, 0)
					`);
				} catch (e) {
					console.warn('[InventoryModel] Copy UNIT_COST/REORDER_LEVEL to ingredients:', e?.message);
				}
			}

			// Migration: drop redundant columns (ingredients is mother table)
			for (const col of ['EXPENSES_ID', 'ITEM_NAME', 'CATEGORY_ID', 'CATEGORY_NAME', 'UNIT', 'UNIT_COST', 'REORDER_LEVEL']) {
				if (colSet.has(col)) {
					try {
						await pool.execute(`ALTER TABLE inventory DROP COLUMN ${col}`);
						console.log(`[InventoryModel] Dropped ${col}`);
					} catch (e) {
						console.warn(`[InventoryModel] Drop ${col}:`, e?.message);
					}
				}
			}

			// Populate inventory from ingredients when empty
			try {
				const [count] = await pool.execute(`SELECT COUNT(*) AS n FROM inventory WHERE ACTIVE = 1 AND INGREDIENT_ID IS NOT NULL`);
				if (Number(count[0]?.n ?? 0) === 0) {
					await pool.execute(`
						INSERT INTO inventory (BRANCH_ID, INGREDIENT_ID, STOCK_QTY, STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT)
						SELECT ing.BRANCH_ID, ing.IDNo, 0, 'In Stock', 1, ing.ENCODED_BY, ing.ENCODED_DT
						FROM ingredients ing
						LEFT JOIN inventory inv ON inv.INGREDIENT_ID = ing.IDNo AND inv.BRANCH_ID = ing.BRANCH_ID AND inv.ACTIVE = 1
						WHERE ing.ACTIVE = 1 AND inv.IDNo IS NULL
					`);
					console.log('[InventoryModel] Populated inventory from ingredients');
				}
			} catch (popErr) {
				console.warn('[InventoryModel] Populate from ingredients skipped:', popErr?.message);
			}

			InventoryModel._schemaReady = true;
			InventoryModel._schemaPromise = null;
		})();

		return InventoryModel._schemaPromise;
	}

	static async getAll(branchId = null, categoryId = null) {
		await InventoryModel.ensureSchema();
		const params = [];
		let where = 'WHERE ing.ACTIVE = 1';
		if (branchId != null && branchId !== undefined) {
			where += ' AND ing.BRANCH_ID = ?';
			params.push(branchId);
		}
		if (categoryId != null && categoryId !== undefined && String(categoryId).trim() !== '') {
			where += ' AND ing.MASTER_CAT_ID = ?';
			params.push(Number(categoryId) || categoryId);
		}
		// Base: ingredients (mother table). LEFT JOIN aggregated inventory for stock only.
		const query = `
			SELECT
				COALESCE(agg.FIRST_ID, ing.IDNo) AS IDNo,
				ing.BRANCH_ID,
				ing.NAME AS ITEM_NAME,
				ing.MASTER_CAT_ID,
				mc.CATEGORY_NAME AS CATEGORY_NAME,
				COALESCE(agg.STOCK_QTY, 0) AS STOCK_QTY,
				ing.UNIT,
				COALESCE(ing.UNIT_COST, 0) AS UNIT_COST,
				COALESCE(ing.REORDER_LEVEL, 0) AS REORDER_LEVEL,
				COALESCE(agg.STATUS_FLAG, 'In Stock') AS STATUS_FLAG,
				1 AS ACTIVE,
				ing.ENCODED_BY,
				ing.ENCODED_DT,
				ing.EDITED_BY,
				ing.EDITED_DT
			FROM ingredients ing
			LEFT JOIN master_categories mc ON mc.IDNo = ing.MASTER_CAT_ID AND mc.ACTIVE = 1
			LEFT JOIN (
				SELECT INGREDIENT_ID, BRANCH_ID, MAX(IDNo) AS FIRST_ID, SUM(STOCK_QTY) AS STOCK_QTY, MAX(STATUS_FLAG) AS STATUS_FLAG
				FROM inventory WHERE ACTIVE = 1 AND INGREDIENT_ID IS NOT NULL
				GROUP BY INGREDIENT_ID, BRANCH_ID
			) agg ON agg.INGREDIENT_ID = ing.IDNo AND agg.BRANCH_ID = ing.BRANCH_ID
			${where}
			ORDER BY ing.NAME ASC, ing.IDNo ASC
		`;
		try {
			const [rows] = await pool.execute(query, params);
			return rows;
		} catch (err) {
			if (err.message && (err.message.includes('INGREDIENT_ID') || err.message.includes('ingredients') || err.message.includes('Unknown column') || err.message.includes("doesn't exist"))) {
				// Fallback: expenses-based (legacy, no inventory join)
				const fbParams = [];
				let fbWhere = 'WHERE e.ACTIVE = 1';
				if (branchId != null && branchId !== undefined) {
					fbWhere += ' AND e.BRANCH_ID = ?';
					fbParams.push(branchId);
				}
				if (categoryId != null && String(categoryId).trim() !== '') {
					fbWhere += ' AND e.MASTER_CAT_ID = ?';
					fbParams.push(Number(categoryId) || categoryId);
				}
				const [fbRows] = await pool.execute(
					`SELECT e.IDNo, e.BRANCH_ID, e.EXP_DESC AS ITEM_NAME, e.MASTER_CAT_ID,
						mc.CATEGORY_NAME AS CATEGORY_NAME, 0 AS STOCK_QTY, 'pcs' AS UNIT,
						COALESCE(e.EXP_AMOUNT, 0) AS UNIT_COST, 0 AS REORDER_LEVEL,
						'In Stock' AS STATUS_FLAG, 1 AS ACTIVE, e.ENCODED_BY, e.ENCODED_DT, e.EDITED_BY, e.EDITED_DT
					FROM expenses e
					INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID AND mc.ACTIVE = 1
					INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID AND oc.ACTIVE = 1 AND oc.STATE = 1
					${fbWhere}
					ORDER BY e.IDNo DESC`,
					fbParams
				);
				return fbRows;
			}
			throw err;
		}
	}

	static async getById(id) {
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`SELECT inv.IDNo, inv.BRANCH_ID, inv.INGREDIENT_ID, inv.STOCK_QTY, inv.STATUS_FLAG, inv.ACTIVE,
				inv.ENCODED_BY, inv.ENCODED_DT, inv.EDITED_BY, inv.EDITED_DT,
				ing.NAME AS ITEM_NAME, ing.MASTER_CAT_ID, mc.CATEGORY_NAME AS CATEGORY_NAME,
				ing.UNIT, COALESCE(ing.UNIT_COST, 0) AS UNIT_COST, COALESCE(ing.REORDER_LEVEL, 0) AS REORDER_LEVEL
			 FROM inventory inv
			 LEFT JOIN ingredients ing ON ing.IDNo = inv.INGREDIENT_ID AND ing.ACTIVE = 1
			 LEFT JOIN master_categories mc ON mc.IDNo = ing.MASTER_CAT_ID AND mc.ACTIVE = 1
			 WHERE inv.IDNo = ? AND inv.ACTIVE = 1 LIMIT 1`,
			[id]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		// Create ingredient first (mother table), then inventory
		const [ingResult] = await pool.execute(
			`INSERT INTO ingredients (BRANCH_ID, NAME, MASTER_CAT_ID, UNIT, UNIT_COST, REORDER_LEVEL, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			[
				Number(data.BRANCH_ID),
				String(data.ITEM_NAME || '').trim(),
				(data.MASTER_CAT_ID ?? data.CATEGORY_ID) != null ? Number(data.MASTER_CAT_ID ?? data.CATEGORY_ID) : null,
				String(data.UNIT || 'pcs'),
				Number(data.UNIT_COST || 0),
				Number(data.REORDER_LEVEL || 0),
				data.user_id || null,
				currentDate,
			]
		);
		const ingredientId = ingResult.insertId;
		await pool.execute(
			`INSERT INTO inventory (BRANCH_ID, INGREDIENT_ID, STOCK_QTY, STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, ?, 1, ?, ?)`,
			[
				Number(data.BRANCH_ID),
				ingredientId,
				Number(data.STOCK_QTY || 0),
				String(data.STATUS_FLAG || 'In Stock'),
				data.user_id || null,
				currentDate,
			]
		);
		const [idRows] = await pool.execute(`SELECT LAST_INSERT_ID() AS id`);
		return Number(idRows[0]?.id || 0);
	}

	static async update(id, data) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		const [existingRows] = await pool.execute(
			`SELECT INGREDIENT_ID FROM inventory WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
			[id]
		);
		if (!existingRows.length) return false;
		const ingredientId = existingRows[0].INGREDIENT_ID;
		if (!ingredientId) return false;
		// Update ingredient (mother table)
		await pool.execute(
			`UPDATE ingredients SET NAME = ?, MASTER_CAT_ID = ?, UNIT = ?, UNIT_COST = ?, REORDER_LEVEL = ?, EDITED_BY = ?, EDITED_DT = ?
			 WHERE IDNo = ? AND ACTIVE = 1`,
			[
				String(data.ITEM_NAME || '').trim(),
				(data.MASTER_CAT_ID ?? data.CATEGORY_ID) != null ? Number(data.MASTER_CAT_ID ?? data.CATEGORY_ID) : null,
				String(data.UNIT || 'pcs'),
				Number(data.UNIT_COST || 0),
				Number(data.REORDER_LEVEL || 0),
				data.user_id || null,
				currentDate,
				ingredientId,
			]
		);
		// Update inventory (stock only)
		const [result] = await pool.execute(
			`UPDATE inventory SET STOCK_QTY = ?, STATUS_FLAG = ?, EDITED_BY = ?, EDITED_DT = ?
			 WHERE IDNo = ? AND ACTIVE = 1`,
			[
				Number(data.STOCK_QTY || 0),
				String(data.STATUS_FLAG || 'In Stock'),
				data.user_id || null,
				currentDate,
				id,
			]
		);
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

	static async updateStockByExpenseId(expenseId, stockQty, branchId = null, addToExisting = false) {
		await InventoryModel.ensureSchema();
		const qty = Number(stockQty);
		if (!Number.isFinite(qty)) return false;
		if (!addToExisting && qty < 0) return false;
		try {
			// Find ingredient for this expense (prefer INGREDIENT_ID if set - para iwas confuse)
			const [exp] = await pool.execute(
				`SELECT
					e.BRANCH_ID,
					e.EXP_DESC,
					e.EXP_AMOUNT,
					e.MASTER_CAT_ID,
					e.INGREDIENT_ID,
					e.ENCODED_BY,
					e.ENCODED_DT
				FROM expenses e
				INNER JOIN master_categories mc ON mc.IDNo = e.MASTER_CAT_ID
				INNER JOIN operation_category oc ON oc.IDNo = mc.OP_CAT_ID
				WHERE e.IDNo = ? LIMIT 1`,
				[expenseId]
			);
			if (!exp.length) return false;
			const brId = branchId ?? exp[0].BRANCH_ID ?? 1;

			let ingredientId = exp[0].INGREDIENT_ID != null && Number.isFinite(Number(exp[0].INGREDIENT_ID))
				? Number(exp[0].INGREDIENT_ID)
				: null;

			// Find or create matching ingredient if not linked yet
			if (!ingredientId) {
				let [ing] = await pool.execute(
					`SELECT IDNo FROM ingredients
					 WHERE BRANCH_ID = ? AND TRIM(NAME) = TRIM(?) AND MASTER_CAT_ID <=> ? AND ACTIVE = 1 LIMIT 1`,
					[brId, exp[0].EXP_DESC, exp[0].MASTER_CAT_ID]
				);
				if (ing.length) {
					ingredientId = ing[0].IDNo;
				} else {
					const [ins] = await pool.execute(
						`INSERT INTO ingredients (BRANCH_ID, NAME, MASTER_CAT_ID, UNIT, ACTIVE, ENCODED_BY, ENCODED_DT)
						 VALUES (?, ?, ?, 'pcs', 1, ?, ?)`,
						[brId, String(exp[0].EXP_DESC || '').trim(), exp[0].MASTER_CAT_ID, exp[0].ENCODED_BY, exp[0].ENCODED_DT]
					);
					ingredientId = ins.insertId;
				}
				// Store link on expense for next time (para iwas confuse)
				try {
					await pool.execute(`UPDATE expenses SET INGREDIENT_ID = ? WHERE IDNo = ? AND ACTIVE = 1`, [ingredientId, expenseId]);
				} catch (_) {}
			}

			// Update or create inventory by INGREDIENT_ID
			const [rows] = await pool.execute(
				`SELECT IDNo, STOCK_QTY FROM inventory WHERE INGREDIENT_ID = ? AND BRANCH_ID = ? AND ACTIVE = 1 LIMIT 1`,
				[ingredientId, brId]
			);
			if (rows.length) {
				const firstId = rows[0].IDNo;
				const newQty = addToExisting ? Math.max(0, (Number(rows[0].STOCK_QTY) || 0) + qty) : qty;
				await pool.execute(
					`UPDATE inventory SET STOCK_QTY = CASE WHEN IDNo = ? THEN ? ELSE 0 END, EDITED_DT = CURRENT_TIMESTAMP
					 WHERE INGREDIENT_ID = ? AND BRANCH_ID = ? AND ACTIVE = 1`,
					[firstId, newQty, ingredientId, brId]
				);
				return true;
			}
			// Create inventory row for ingredient
			await pool.execute(
				`INSERT INTO inventory (BRANCH_ID, INGREDIENT_ID, STOCK_QTY, STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT)
				 VALUES (?, ?, ?, 'In Stock', 1, ?, ?)`,
				[brId, ingredientId, qty, exp[0].ENCODED_BY, exp[0].ENCODED_DT]
			);
			return true;
		} catch (err) {
			if (err.message && (err.message.includes('INGREDIENT_ID') || err.message.includes('ingredients') || err.message.includes('EXPENSES_ID'))) return false;
			throw err;
		}
	}

	/** Sync existing inventory rows: set INGREDIENT_ID from EXPENSES_ID (match expense → ingredient). No-op if EXPENSES_ID already dropped. */
	static async syncToIngredientIds() {
		await InventoryModel.ensureSchema();
		try {
			const [cols] = await pool.execute(
				`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory'`
			);
			if (!cols.some((c) => c.COLUMN_NAME === 'EXPENSES_ID')) return 0;
			await IngredientModel.ensureSchema();
			const [upd] = await pool.execute(`
				UPDATE inventory i
				INNER JOIN expenses e ON e.IDNo = i.EXPENSES_ID AND e.ACTIVE = 1
				INNER JOIN ingredients ing ON ing.BRANCH_ID = i.BRANCH_ID
				  AND TRIM(ing.NAME) = TRIM(e.EXP_DESC)
				  AND ing.MASTER_CAT_ID <=> e.MASTER_CAT_ID
				  AND ing.ACTIVE = 1
				SET i.INGREDIENT_ID = ing.IDNo
				WHERE i.EXPENSES_ID IS NOT NULL AND i.ACTIVE = 1 AND i.INGREDIENT_ID IS NULL
			`);
			return upd.affectedRows;
		} catch (err) {
			console.warn('[InventoryModel.syncToIngredientIds]', err?.message);
			return 0;
		}
	}
}

module.exports = InventoryModel;

InventoryModel.ensureSchema().catch((error) => {
	console.error('[INVENTORY MODEL] Failed to ensure schema:', error.message);
});

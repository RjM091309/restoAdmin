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

			InventoryModel._schemaReady = true;
			InventoryModel._schemaPromise = null;
		})();

		return InventoryModel._schemaPromise;
	}

	static async getAll(branchId = null) {
		await InventoryModel.ensureSchema();
		let query = `
			SELECT
				IDNo,
				BRANCH_ID,
				ITEM_NAME,
				CATEGORY_ID,
				CATEGORY_NAME,
				STOCK_QTY,
				UNIT,
				UNIT_COST,
				REORDER_LEVEL,
				STATUS_FLAG,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT,
				EDITED_BY,
				EDITED_DT
			FROM inventory
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
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(`SELECT * FROM inventory WHERE IDNo = ? AND ACTIVE = 1`, [id]);
		return rows[0] || null;
	}

	static async create(data) {
		await InventoryModel.ensureSchema();
		const currentDate = new Date();
		const parsedUnitCost = Number(data.UNIT_COST || 0);
		const [result] = await pool.execute(
			`INSERT INTO inventory (
				BRANCH_ID,
				ITEM_NAME,
				CATEGORY_ID,
				CATEGORY_NAME,
				STOCK_QTY,
				UNIT,
				UNIT_COST,
				REORDER_LEVEL,
				STATUS_FLAG,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			[
				Number(data.BRANCH_ID),
				String(data.ITEM_NAME).trim(),
				data.CATEGORY_ID ? Number(data.CATEGORY_ID) : null,
				data.CATEGORY_NAME || null,
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
				CATEGORY_NAME = ?,
				STOCK_QTY = ?,
				UNIT = ?,
				UNIT_COST = ?,
				REORDER_LEVEL = ?,
				STATUS_FLAG = ?,
				EDITED_BY = ?,
				EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1`,
			[
				String(data.ITEM_NAME).trim(),
				data.CATEGORY_ID ? Number(data.CATEGORY_ID) : null,
				data.CATEGORY_NAME || null,
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
}

module.exports = InventoryModel;

InventoryModel.ensureSchema().catch((error) => {
	console.error('[INVENTORY MODEL] Failed to ensure schema:', error.message);
});

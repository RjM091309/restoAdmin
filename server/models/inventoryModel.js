const pool = require('../config/db');

const STATUS_ACTIVE = 'Active';
const STATUS_INACTIVE = 'Inactive';

class InventoryModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (InventoryModel._schemaReady) return;
		if (InventoryModel._schemaPromise) return InventoryModel._schemaPromise;

		InventoryModel._schemaPromise = (async () => {
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_categories (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					CATEGORY_NAME VARCHAR(120) NOT NULL,
					DESCRIPTION TEXT NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_categories_branch (BRANCH_ID)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_products (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					CATEGORY_ID INT NULL,
					CATEGORY_NAME VARCHAR(120) NULL,
					PRODUCT_NAME VARCHAR(180) NOT NULL,
					UNIT VARCHAR(80) NULL,
					TYPE VARCHAR(80) NULL,
					STATUS VARCHAR(20) NOT NULL DEFAULT 'Active',
					PRICE DECIMAL(12,2) NOT NULL DEFAULT 0,
					STOCK DECIMAL(12,3) NOT NULL DEFAULT 0,
					SKU VARCHAR(120) NULL,
					BARCODE VARCHAR(120) NULL,
					DESCRIPTION TEXT NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_products_branch (BRANCH_ID),
					INDEX idx_inventory_products_category (CATEGORY_ID),
					INDEX idx_inventory_products_status (STATUS)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_materials (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					CATEGORY_ID INT NULL,
					CATEGORY_NAME VARCHAR(120) NULL,
					MATERIAL_NAME VARCHAR(180) NOT NULL,
					UNIT VARCHAR(80) NULL,
					STATUS VARCHAR(20) NOT NULL DEFAULT 'Active',
					STOCK DECIMAL(12,3) NOT NULL DEFAULT 0,
					UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0,
					SKU VARCHAR(120) NULL,
					BARCODE VARCHAR(120) NULL,
					DESCRIPTION TEXT NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_materials_branch (BRANCH_ID),
					INDEX idx_inventory_materials_category (CATEGORY_ID),
					INDEX idx_inventory_materials_status (STATUS)
				)
			`);

			const [prodCategoryIdRows] = await pool.execute(`
				SELECT COUNT(*) AS count FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_products' AND COLUMN_NAME = 'CATEGORY_ID'
			`);
			if (Number(prodCategoryIdRows?.[0]?.count || 0) === 0) {
				await pool.execute(`ALTER TABLE inventory_products ADD COLUMN CATEGORY_ID INT NULL AFTER BRANCH_ID, ADD INDEX idx_inventory_products_category (CATEGORY_ID)`);
			}

			const [matCategoryIdRows] = await pool.execute(`
				SELECT COUNT(*) AS count FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_materials' AND COLUMN_NAME = 'CATEGORY_ID'
			`);
			if (Number(matCategoryIdRows?.[0]?.count || 0) === 0) {
				await pool.execute(`ALTER TABLE inventory_materials ADD COLUMN CATEGORY_ID INT NULL AFTER BRANCH_ID, ADD INDEX idx_inventory_materials_category (CATEGORY_ID)`);
			}

			const [totalCostColumnRows] = await pool.execute(
				`
				SELECT COUNT(*) AS count
				FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE()
					AND TABLE_NAME = 'inventory_materials'
					AND COLUMN_NAME = 'TOTAL_COST'
				`
			);
			const hasTotalCostColumn = Number(totalCostColumnRows?.[0]?.count || 0) > 0;
			if (!hasTotalCostColumn) {
				await pool.execute(`
					ALTER TABLE inventory_materials
					ADD COLUMN TOTAL_COST DECIMAL(12,2)
						GENERATED ALWAYS AS (ROUND(STOCK * UNIT_COST, 2)) STORED
						AFTER UNIT_COST
				`);
			}

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS menu_inventory_map (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					MENU_ID INT NOT NULL,
					PRODUCT_ID INT NULL,
					MATERIAL_ID INT NULL,
					QUANTITY DECIMAL(12,3) NOT NULL DEFAULT 1,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_menu_inventory_menu (MENU_ID),
					INDEX idx_menu_inventory_product (PRODUCT_ID),
					INDEX idx_menu_inventory_material (MATERIAL_ID)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS order_inventory_deductions (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					ORDER_ID INT NOT NULL,
					DEDUCTED_BY INT NULL,
					DEDUCTED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					UNIQUE KEY uq_order_inventory_deduction_order (ORDER_ID)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_movements (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					ORDER_ID INT NOT NULL,
					MENU_ID INT NOT NULL,
					RESOURCE_TYPE VARCHAR(20) NOT NULL,
					RESOURCE_ID INT NOT NULL,
					QTY_DEDUCTED DECIMAL(12,3) NOT NULL,
					STOCK_BEFORE DECIMAL(12,3) NOT NULL,
					STOCK_AFTER DECIMAL(12,3) NOT NULL,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					INDEX idx_inventory_movements_order (ORDER_ID),
					INDEX idx_inventory_movements_resource (RESOURCE_TYPE, RESOURCE_ID)
				)
			`);

			await pool.execute(`
				CREATE TABLE IF NOT EXISTS inventory_stock_ins (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_ID INT NOT NULL,
					RESOURCE_TYPE VARCHAR(20) NOT NULL,
					RESOURCE_ID INT NOT NULL,
					QTY_ADDED DECIMAL(12,3) NOT NULL DEFAULT 0,
					PREV_STOCK DECIMAL(12,3) NULL,
					NEW_STOCK DECIMAL(12,3) NULL,
					UNIT_COST DECIMAL(12,2) NOT NULL DEFAULT 0,
					PREV_UNIT_COST DECIMAL(12,2) NULL,
					NEW_UNIT_COST DECIMAL(12,2) NULL,
					TOTAL_COST DECIMAL(12,2) GENERATED ALWAYS AS (ROUND(QTY_ADDED * UNIT_COST, 2)) STORED,
					SUPPLIER_NAME VARCHAR(180) NULL,
					REFERENCE_NO VARCHAR(120) NULL,
					NOTE TEXT NULL,
					STOCK_IN_DATE DATE NOT NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					EDITED_BY INT NULL,
					EDITED_DT DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
					INDEX idx_inventory_stock_ins_branch_date (BRANCH_ID, STOCK_IN_DATE),
					INDEX idx_inventory_stock_ins_resource (RESOURCE_TYPE, RESOURCE_ID)
				)
			`);

			const [prevUnitCostColumnRows] = await pool.execute(
				`
				SELECT COUNT(*) AS count
				FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE()
					AND TABLE_NAME = 'inventory_stock_ins'
					AND COLUMN_NAME = 'PREV_UNIT_COST'
				`
			);
			if (Number(prevUnitCostColumnRows?.[0]?.count || 0) === 0) {
				await pool.execute(`
					ALTER TABLE inventory_stock_ins
					ADD COLUMN PREV_UNIT_COST DECIMAL(12,2) NULL AFTER UNIT_COST
				`);
			}

			const [newUnitCostColumnRows] = await pool.execute(
				`
				SELECT COUNT(*) AS count
				FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE()
					AND TABLE_NAME = 'inventory_stock_ins'
					AND COLUMN_NAME = 'NEW_UNIT_COST'
				`
			);
			if (Number(newUnitCostColumnRows?.[0]?.count || 0) === 0) {
				await pool.execute(`
					ALTER TABLE inventory_stock_ins
					ADD COLUMN NEW_UNIT_COST DECIMAL(12,2) NULL AFTER PREV_UNIT_COST
				`);
			}

			const [prevStockColumnRows] = await pool.execute(
				`
				SELECT COUNT(*) AS count
				FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE()
					AND TABLE_NAME = 'inventory_stock_ins'
					AND COLUMN_NAME = 'PREV_STOCK'
				`
			);
			if (Number(prevStockColumnRows?.[0]?.count || 0) === 0) {
				await pool.execute(`
					ALTER TABLE inventory_stock_ins
					ADD COLUMN PREV_STOCK DECIMAL(12,3) NULL AFTER QTY_ADDED
				`);
			}

			const [newStockColumnRows] = await pool.execute(
				`
				SELECT COUNT(*) AS count
				FROM information_schema.COLUMNS
				WHERE TABLE_SCHEMA = DATABASE()
					AND TABLE_NAME = 'inventory_stock_ins'
					AND COLUMN_NAME = 'NEW_STOCK'
				`
			);
			if (Number(newStockColumnRows?.[0]?.count || 0) === 0) {
				await pool.execute(`
					ALTER TABLE inventory_stock_ins
					ADD COLUMN NEW_STOCK DECIMAL(12,3) NULL AFTER PREV_STOCK
				`);
			}
			InventoryModel._schemaReady = true;
		})().catch((error) => {
			InventoryModel._schemaPromise = null;
			throw error;
		});

		return InventoryModel._schemaPromise;
	}

	static normalizeStatus(status) {
		return status === STATUS_INACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;
	}

	static _safeNumber(value, fallback = 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	static _computeWeightedAverage(currentStock, currentCost, addedQty, addedCost) {
		const stockNow = InventoryModel._safeNumber(currentStock, 0);
		const costNow = InventoryModel._safeNumber(currentCost, 0);
		const qtyIn = InventoryModel._safeNumber(addedQty, 0);
		const costIn = InventoryModel._safeNumber(addedCost, 0);
		const nextStock = stockNow + qtyIn;
		if (nextStock <= 0) return 0;
		const totalValue = stockNow * costNow + qtyIn * costIn;
		return Number((totalValue / nextStock).toFixed(2));
	}

	static _computeAverageAfterRemoving(currentStock, currentCost, removedQty, removedCost) {
		const stockNow = InventoryModel._safeNumber(currentStock, 0);
		const costNow = InventoryModel._safeNumber(currentCost, 0);
		const qtyOut = InventoryModel._safeNumber(removedQty, 0);
		const costOut = InventoryModel._safeNumber(removedCost, 0);
		const nextStock = stockNow - qtyOut;
		if (nextStock <= 0) return 0;
		const currentValue = stockNow * costNow;
		const removedValue = qtyOut * costOut;
		const nextValue = Math.max(0, currentValue - removedValue);
		return Number((nextValue / nextStock).toFixed(2));
	}

	static _todayInPht() {
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Manila',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});
		return formatter.format(new Date());
	}

	static async getProducts(branchId = null) {
		await InventoryModel.ensureSchema();
		let query = `
			SELECT
				p.IDNo,
				p.BRANCH_ID,
				p.CATEGORY_ID,
				p.CATEGORY_NAME,
				c.CATEGORY_NAME AS CATEGORY_LABEL,
				p.PRODUCT_NAME,
				p.UNIT,
				p.TYPE,
				p.STATUS,
				p.PRICE,
				p.STOCK,
				p.SKU,
				p.BARCODE,
				p.DESCRIPTION
			FROM inventory_products p
			LEFT JOIN inventory_categories c ON c.IDNo = p.CATEGORY_ID
			WHERE p.ACTIVE = 1
		`;
		const params = [];
		if (branchId !== null && branchId !== undefined) {
			query += ` AND p.BRANCH_ID = ?`;
			params.push(branchId);
		}
		query += ` ORDER BY p.IDNo DESC`;
		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async createProduct(data) {
		await InventoryModel.ensureSchema();
		const query = `
			INSERT INTO inventory_products (
				BRANCH_ID, CATEGORY_ID, CATEGORY_NAME, PRODUCT_NAME, UNIT, TYPE, STATUS,
				PRICE, STOCK, SKU, BARCODE, DESCRIPTION, ENCODED_BY
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;
		const [result] = await pool.execute(query, [
			data.BRANCH_ID,
			data.CATEGORY_ID || null,
			data.CATEGORY_NAME || null,
			data.PRODUCT_NAME,
			data.UNIT || null,
			data.TYPE || null,
			InventoryModel.normalizeStatus(data.STATUS),
			Number(data.PRICE || 0),
			Number(data.STOCK || 0),
			data.SKU || null,
			data.BARCODE || null,
			data.DESCRIPTION || null,
			data.user_id || null,
		]);
		return result.insertId;
	}

	static async getProductById(id) {
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				p.IDNo,
				p.BRANCH_ID,
				p.CATEGORY_ID,
				p.CATEGORY_NAME,
				p.PRODUCT_NAME,
				p.UNIT,
				p.TYPE,
				p.STATUS,
				p.PRICE,
				p.STOCK,
				p.SKU,
				p.BARCODE,
				p.DESCRIPTION,
				p.ACTIVE
			FROM inventory_products p
			WHERE p.IDNo = ?
			LIMIT 1
			`,
			[id]
		);
		return rows[0] || null;
	}

	static async updateProduct(id, data) {
		await InventoryModel.ensureSchema();
		const query = `
			UPDATE inventory_products SET
				CATEGORY_ID = ?,
				CATEGORY_NAME = ?,
				PRODUCT_NAME = ?,
				UNIT = ?,
				TYPE = ?,
				STATUS = ?,
				PRICE = ?,
				STOCK = ?,
				SKU = ?,
				BARCODE = ?,
				DESCRIPTION = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1
		`;
		const [result] = await pool.execute(query, [
			data.CATEGORY_ID || null,
			data.CATEGORY_NAME || null,
			data.PRODUCT_NAME,
			data.UNIT || null,
			data.TYPE || null,
			InventoryModel.normalizeStatus(data.STATUS),
			Number(data.PRICE || 0),
			Number(data.STOCK || 0),
			data.SKU || null,
			data.BARCODE || null,
			data.DESCRIPTION || null,
			data.user_id || null,
			id,
		]);
		return result.affectedRows > 0;
	}

	static async deleteProduct(id, userId) {
		await InventoryModel.ensureSchema();
		const [result] = await pool.execute(
			`UPDATE inventory_products SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
			[userId || null, id]
		);
		return result.affectedRows > 0;
	}

	static async getMaterials(branchId = null) {
		await InventoryModel.ensureSchema();
		let query = `
			SELECT
				m.IDNo,
				m.BRANCH_ID,
				m.CATEGORY_ID,
				m.CATEGORY_NAME,
				c.CATEGORY_NAME AS CATEGORY_LABEL,
				m.MATERIAL_NAME,
				m.UNIT,
				m.STATUS,
				m.STOCK,
				m.UNIT_COST,
				m.TOTAL_COST,
				m.SKU,
				m.BARCODE,
				m.DESCRIPTION
			FROM inventory_materials m
			LEFT JOIN inventory_categories c ON c.IDNo = m.CATEGORY_ID
			WHERE m.ACTIVE = 1
		`;
		const params = [];
		if (branchId !== null && branchId !== undefined) {
			query += ` AND m.BRANCH_ID = ?`;
			params.push(branchId);
		}
		query += ` ORDER BY m.IDNo DESC`;
		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async createMaterial(data) {
		await InventoryModel.ensureSchema();
		const query = `
			INSERT INTO inventory_materials (
				BRANCH_ID, CATEGORY_ID, CATEGORY_NAME, MATERIAL_NAME, UNIT, STATUS,
				STOCK, UNIT_COST, SKU, BARCODE, DESCRIPTION, ENCODED_BY
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;
		const [result] = await pool.execute(query, [
			data.BRANCH_ID,
			data.CATEGORY_ID || null,
			data.CATEGORY_NAME || null,
			data.MATERIAL_NAME,
			data.UNIT || null,
			InventoryModel.normalizeStatus(data.STATUS),
			Number(data.STOCK || 0),
			Number(data.UNIT_COST || 0),
			data.SKU || null,
			data.BARCODE || null,
			data.DESCRIPTION || null,
			data.user_id || null,
		]);
		return result.insertId;
	}

	static async getMaterialById(id) {
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				m.IDNo,
				m.BRANCH_ID,
				m.CATEGORY_ID,
				m.CATEGORY_NAME,
				m.MATERIAL_NAME,
				m.UNIT,
				m.STATUS,
				m.STOCK,
				m.UNIT_COST,
				m.TOTAL_COST,
				m.SKU,
				m.BARCODE,
				m.DESCRIPTION,
				m.ACTIVE
			FROM inventory_materials m
			WHERE m.IDNo = ?
			LIMIT 1
			`,
			[id]
		);
		return rows[0] || null;
	}

	static async updateMaterial(id, data) {
		await InventoryModel.ensureSchema();
		const query = `
			UPDATE inventory_materials SET
				CATEGORY_ID = ?,
				CATEGORY_NAME = ?,
				MATERIAL_NAME = ?,
				UNIT = ?,
				STATUS = ?,
				STOCK = ?,
				UNIT_COST = ?,
				SKU = ?,
				BARCODE = ?,
				DESCRIPTION = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1
		`;
		const [result] = await pool.execute(query, [
			data.CATEGORY_ID || null,
			data.CATEGORY_NAME || null,
			data.MATERIAL_NAME,
			data.UNIT || null,
			InventoryModel.normalizeStatus(data.STATUS),
			Number(data.STOCK || 0),
			Number(data.UNIT_COST || 0),
			data.SKU || null,
			data.BARCODE || null,
			data.DESCRIPTION || null,
			data.user_id || null,
			id,
		]);
		return result.affectedRows > 0;
	}

	static async deleteMaterial(id, userId) {
		await InventoryModel.ensureSchema();
		const [result] = await pool.execute(
			`UPDATE inventory_materials SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
			[userId || null, id]
		);
		return result.affectedRows > 0;
	}

	static async getMappingsByMenuIds(menuIds) {
		await InventoryModel.ensureSchema();
		if (!Array.isArray(menuIds) || menuIds.length === 0) return [];
		const placeholders = menuIds.map(() => '?').join(',');
		const [rows] = await pool.execute(
			`
			SELECT
				mim.IDNo,
				mim.MENU_ID,
				mim.PRODUCT_ID,
				mim.MATERIAL_ID,
				mim.QUANTITY,
				p.PRODUCT_NAME,
				p.STOCK AS PRODUCT_STOCK,
				p.STATUS AS PRODUCT_STATUS,
				mt.MATERIAL_NAME,
				mt.STOCK AS MATERIAL_STOCK,
				mt.STATUS AS MATERIAL_STATUS
			FROM menu_inventory_map mim
			LEFT JOIN inventory_products p ON p.IDNo = mim.PRODUCT_ID AND p.ACTIVE = 1
			LEFT JOIN inventory_materials mt ON mt.IDNo = mim.MATERIAL_ID AND mt.ACTIVE = 1
			WHERE mim.ACTIVE = 1 AND mim.MENU_ID IN (${placeholders})
			`,
			menuIds
		);
		return rows;
	}

	static async replaceMenuMappings(menuId, mappings, userId, connection = null) {
		await InventoryModel.ensureSchema();
		const conn = connection || (await pool.getConnection());
		const managed = !connection;
		try {
			if (managed) await conn.beginTransaction();
			await conn.execute(`UPDATE menu_inventory_map SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE MENU_ID = ?`, [userId || null, menuId]);

			if (Array.isArray(mappings) && mappings.length > 0) {
				const values = mappings.map((mapping) => [
					menuId,
					mapping.product_id || null,
					mapping.material_id || null,
					Number(mapping.quantity || 0),
					1,
					userId || null,
					new Date(),
				]);
				await conn.query(
					`
					INSERT INTO menu_inventory_map
						(MENU_ID, PRODUCT_ID, MATERIAL_ID, QUANTITY, ACTIVE, ENCODED_BY, ENCODED_DT)
					VALUES ?
					`,
					[values]
				);
			}
			if (managed) await conn.commit();
		} catch (error) {
			if (managed) await conn.rollback();
			throw error;
		} finally {
			if (managed) conn.release();
		}
	}

	static async getStockIns(branchId = null) {
		await InventoryModel.ensureSchema();
		let query = `
			SELECT
				si.IDNo,
				si.BRANCH_ID,
				si.RESOURCE_TYPE,
				si.RESOURCE_ID,
				si.QTY_ADDED,
				si.PREV_STOCK,
				si.NEW_STOCK,
				si.UNIT_COST,
				si.PREV_UNIT_COST,
				si.NEW_UNIT_COST,
				si.TOTAL_COST,
				si.SUPPLIER_NAME,
				si.REFERENCE_NO,
				si.NOTE,
				si.STOCK_IN_DATE,
				si.ENCODED_BY,
				si.ENCODED_DT,
				COALESCE(p.UNIT, m.UNIT) AS RESOURCE_UNIT,
				p.PRODUCT_NAME,
				m.MATERIAL_NAME
			FROM inventory_stock_ins si
			LEFT JOIN inventory_products p
				ON si.RESOURCE_TYPE = 'product' AND p.IDNo = si.RESOURCE_ID
			LEFT JOIN inventory_materials m
				ON si.RESOURCE_TYPE = 'material' AND m.IDNo = si.RESOURCE_ID
			WHERE si.ACTIVE = 1
		`;
		const params = [];
		if (branchId !== null && branchId !== undefined) {
			query += ` AND si.BRANCH_ID = ?`;
			params.push(branchId);
		}
		query += ` ORDER BY si.STOCK_IN_DATE DESC, si.IDNo DESC`;
		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async createStockIn(data) {
		await InventoryModel.ensureSchema();
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const resourceType = data.RESOURCE_TYPE === 'material' ? 'material' : 'product';
			const resourceId = Number(data.RESOURCE_ID);
			const qtyAdded = Number(data.QTY_ADDED || 0);
			const unitCost = Number(data.UNIT_COST || 0);
			if (!Number.isFinite(resourceId) || resourceId <= 0) {
				throw new Error('Invalid resource ID');
			}
			if (!Number.isFinite(qtyAdded) || qtyAdded <= 0) {
				throw new Error('Quantity must be greater than 0');
			}
			if (!Number.isFinite(unitCost) || unitCost < 0) {
				throw new Error('Unit cost cannot be negative');
			}

			let row = null;
			let prevStock = 0;
			let newStock = 0;
			let prevUnitCost = 0;
			let newUnitCost = 0;
			if (resourceType === 'product') {
				const [rows] = await connection.execute(
					`SELECT IDNo, BRANCH_ID, PRODUCT_NAME, STOCK, PRICE, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
					[resourceId]
				);
				row = rows[0] || null;
				if (!row || Number(row.ACTIVE) !== 1) throw new Error('Product not found');
				if (Number(row.BRANCH_ID) !== Number(data.BRANCH_ID)) throw new Error('Resource branch mismatch');

				prevStock = Number(row.STOCK || 0);
				const nextStock = prevStock + qtyAdded;
				newStock = nextStock;
				prevUnitCost = Number(row.PRICE || 0);
				const nextPrice = InventoryModel._computeWeightedAverage(
					Number(row.STOCK || 0),
					Number(row.PRICE || 0),
					qtyAdded,
					unitCost
				);
				newUnitCost = nextPrice;
				await connection.execute(
					`UPDATE inventory_products SET STOCK = ?, PRICE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
					[nextStock, nextPrice, data.user_id || null, resourceId]
				);
			} else {
				const [rows] = await connection.execute(
					`SELECT IDNo, BRANCH_ID, MATERIAL_NAME, STOCK, UNIT_COST, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
					[resourceId]
				);
				row = rows[0] || null;
				if (!row || Number(row.ACTIVE) !== 1) throw new Error('Material not found');
				if (Number(row.BRANCH_ID) !== Number(data.BRANCH_ID)) throw new Error('Resource branch mismatch');

				prevStock = Number(row.STOCK || 0);
				const nextStock = prevStock + qtyAdded;
				newStock = nextStock;
				prevUnitCost = Number(row.UNIT_COST || 0);
				const nextUnitCost = InventoryModel._computeWeightedAverage(
					Number(row.STOCK || 0),
					Number(row.UNIT_COST || 0),
					qtyAdded,
					unitCost
				);
				newUnitCost = nextUnitCost;
				await connection.execute(
					`UPDATE inventory_materials SET STOCK = ?, UNIT_COST = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
					[nextStock, nextUnitCost, data.user_id || null, resourceId]
				);
			}

			const [insertResult] = await connection.execute(
				`
				INSERT INTO inventory_stock_ins (
					BRANCH_ID, RESOURCE_TYPE, RESOURCE_ID, QTY_ADDED, PREV_STOCK, NEW_STOCK, UNIT_COST,
					PREV_UNIT_COST, NEW_UNIT_COST, SUPPLIER_NAME, REFERENCE_NO, NOTE, STOCK_IN_DATE, ENCODED_BY
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				[
					Number(data.BRANCH_ID),
					resourceType,
					resourceId,
					qtyAdded,
					prevStock,
					newStock,
					unitCost,
					prevUnitCost,
					newUnitCost,
					data.SUPPLIER_NAME || null,
					data.REFERENCE_NO || null,
					data.NOTE || null,
					data.STOCK_IN_DATE || InventoryModel._todayInPht(),
					data.user_id || null,
				]
			);

			await connection.commit();

			return {
				stockInId: Number(insertResult.insertId),
				branchId: Number(data.BRANCH_ID),
				resourceType,
				resourceId,
				resourceName: resourceType === 'product' ? row.PRODUCT_NAME : row.MATERIAL_NAME,
				qtyAdded,
				prevStock,
				newStock,
				unitCost,
				totalCost: Number((qtyAdded * unitCost).toFixed(2)),
				prevUnitCost,
				newUnitCost,
				stockInDate: data.STOCK_IN_DATE || InventoryModel._todayInPht(),
			};
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	static async getStockInById(id) {
		await InventoryModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT
				si.IDNo,
				si.BRANCH_ID,
				si.RESOURCE_TYPE,
				si.RESOURCE_ID,
				si.QTY_ADDED,
				si.PREV_STOCK,
				si.NEW_STOCK,
				si.UNIT_COST,
				si.PREV_UNIT_COST,
				si.NEW_UNIT_COST,
				si.TOTAL_COST,
				si.SUPPLIER_NAME,
				si.REFERENCE_NO,
				si.NOTE,
				si.STOCK_IN_DATE,
				si.ACTIVE,
				p.PRODUCT_NAME,
				m.MATERIAL_NAME
			FROM inventory_stock_ins si
			LEFT JOIN inventory_products p
				ON si.RESOURCE_TYPE = 'product' AND p.IDNo = si.RESOURCE_ID
			LEFT JOIN inventory_materials m
				ON si.RESOURCE_TYPE = 'material' AND m.IDNo = si.RESOURCE_ID
			WHERE si.IDNo = ?
			LIMIT 1
			`,
			[id]
		);
		return rows[0] || null;
	}

	static async updateStockIn(id, data) {
		await InventoryModel.ensureSchema();
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [stockInRows] = await connection.execute(
				`
				SELECT IDNo, BRANCH_ID, RESOURCE_TYPE, RESOURCE_ID, QTY_ADDED, UNIT_COST, ACTIVE
				FROM inventory_stock_ins
				WHERE IDNo = ?
				FOR UPDATE
				`,
				[id]
			);
			const current = stockInRows[0] || null;
			if (!current || Number(current.ACTIVE) !== 1) {
				throw new Error('Stock-in record not found');
			}

			const branchId = Number(current.BRANCH_ID);
			const oldType = current.RESOURCE_TYPE === 'material' ? 'material' : 'product';
			const oldResourceId = Number(current.RESOURCE_ID);
			const oldQty = Number(current.QTY_ADDED || 0);
			const oldUnitCost = Number(current.UNIT_COST || 0);
			let prevStock = 0;
			let newStock = 0;
			let prevUnitCost = 0;
			let newUnitCost = 0;

			const resourceType = data.RESOURCE_TYPE === 'material' ? 'material' : 'product';
			const resourceId = Number(data.RESOURCE_ID);
			const qtyAdded = Number(data.QTY_ADDED || 0);
			const unitCost = Number(data.UNIT_COST || 0);

			if (!Number.isFinite(resourceId) || resourceId <= 0) throw new Error('Invalid resource ID');
			if (!Number.isFinite(qtyAdded) || qtyAdded <= 0) throw new Error('Quantity must be greater than 0');
			if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Unit cost cannot be negative');

			if (oldType === resourceType && oldResourceId === resourceId) {
				if (resourceType === 'product') {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, PRODUCT_NAME, STOCK, PRICE, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
						[resourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Product not found');
					if (Number(row.BRANCH_ID) !== branchId) throw new Error('Resource branch mismatch');
					const nextStock = Number(row.STOCK || 0) - oldQty + qtyAdded;
					if (nextStock < 0) throw new Error('Cannot update stock-in because inventory is already consumed');
					prevStock = Number(row.STOCK || 0) - oldQty;
					newStock = nextStock;
					const afterRemovalPrice = InventoryModel._computeAverageAfterRemoving(
						Number(row.STOCK || 0),
						Number(row.PRICE || 0),
						oldQty,
						oldUnitCost
					);
					const nextPrice = InventoryModel._computeWeightedAverage(
						Math.max(0, Number(row.STOCK || 0) - oldQty),
						afterRemovalPrice,
						qtyAdded,
						unitCost
					);
					prevUnitCost = Number(row.PRICE || 0);
					newUnitCost = nextPrice;
					await connection.execute(
						`UPDATE inventory_products SET STOCK = ?, PRICE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[nextStock, nextPrice, data.user_id || null, resourceId]
					);
				} else {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, MATERIAL_NAME, STOCK, UNIT_COST, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
						[resourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Material not found');
					if (Number(row.BRANCH_ID) !== branchId) throw new Error('Resource branch mismatch');
					const nextStock = Number(row.STOCK || 0) - oldQty + qtyAdded;
					if (nextStock < 0) throw new Error('Cannot update stock-in because inventory is already consumed');
					prevStock = Number(row.STOCK || 0) - oldQty;
					newStock = nextStock;
					const afterRemovalCost = InventoryModel._computeAverageAfterRemoving(
						Number(row.STOCK || 0),
						Number(row.UNIT_COST || 0),
						oldQty,
						oldUnitCost
					);
					const nextUnitCost = InventoryModel._computeWeightedAverage(
						Math.max(0, Number(row.STOCK || 0) - oldQty),
						afterRemovalCost,
						qtyAdded,
						unitCost
					);
					prevUnitCost = Number(row.UNIT_COST || 0);
					newUnitCost = nextUnitCost;
					await connection.execute(
						`UPDATE inventory_materials SET STOCK = ?, UNIT_COST = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[nextStock, nextUnitCost, data.user_id || null, resourceId]
					);
				}
			} else {
				if (oldType === 'product') {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, STOCK, PRICE, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
						[oldResourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Original product not found');
					const reversed = Number(row.STOCK || 0) - oldQty;
					if (reversed < 0) throw new Error('Cannot update stock-in because inventory is already consumed');
					const reversedPrice = InventoryModel._computeAverageAfterRemoving(
						Number(row.STOCK || 0),
						Number(row.PRICE || 0),
						oldQty,
						oldUnitCost
					);
					await connection.execute(
						`UPDATE inventory_products SET STOCK = ?, PRICE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[reversed, reversedPrice, data.user_id || null, oldResourceId]
					);
				} else {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, STOCK, UNIT_COST, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
						[oldResourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Original material not found');
					const reversed = Number(row.STOCK || 0) - oldQty;
					if (reversed < 0) throw new Error('Cannot update stock-in because inventory is already consumed');
					const reversedUnitCost = InventoryModel._computeAverageAfterRemoving(
						Number(row.STOCK || 0),
						Number(row.UNIT_COST || 0),
						oldQty,
						oldUnitCost
					);
					await connection.execute(
						`UPDATE inventory_materials SET STOCK = ?, UNIT_COST = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[reversed, reversedUnitCost, data.user_id || null, oldResourceId]
					);
				}

				if (resourceType === 'product') {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, PRODUCT_NAME, STOCK, PRICE, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
						[resourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Product not found');
					if (Number(row.BRANCH_ID) !== branchId) throw new Error('Resource branch mismatch');
					prevStock = Number(row.STOCK || 0);
					newStock = prevStock + qtyAdded;
					const nextPrice = InventoryModel._computeWeightedAverage(
						Number(row.STOCK || 0),
						Number(row.PRICE || 0),
						qtyAdded,
						unitCost
					);
					prevUnitCost = Number(row.PRICE || 0);
					newUnitCost = nextPrice;
					await connection.execute(
						`UPDATE inventory_products SET STOCK = ?, PRICE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[Number(row.STOCK || 0) + qtyAdded, nextPrice, data.user_id || null, resourceId]
					);
				} else {
					const [rows] = await connection.execute(
						`SELECT IDNo, BRANCH_ID, MATERIAL_NAME, STOCK, UNIT_COST, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
						[resourceId]
					);
					const row = rows[0] || null;
					if (!row || Number(row.ACTIVE) !== 1) throw new Error('Material not found');
					if (Number(row.BRANCH_ID) !== branchId) throw new Error('Resource branch mismatch');
					prevStock = Number(row.STOCK || 0);
					newStock = prevStock + qtyAdded;
					const nextUnitCost = InventoryModel._computeWeightedAverage(
						Number(row.STOCK || 0),
						Number(row.UNIT_COST || 0),
						qtyAdded,
						unitCost
					);
					prevUnitCost = Number(row.UNIT_COST || 0);
					newUnitCost = nextUnitCost;
					await connection.execute(
						`UPDATE inventory_materials SET STOCK = ?, UNIT_COST = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[Number(row.STOCK || 0) + qtyAdded, nextUnitCost, data.user_id || null, resourceId]
					);
				}
			}

			await connection.execute(
				`
				UPDATE inventory_stock_ins
				SET
					RESOURCE_TYPE = ?,
					RESOURCE_ID = ?,
					QTY_ADDED = ?,
					PREV_STOCK = ?,
					NEW_STOCK = ?,
					UNIT_COST = ?,
					PREV_UNIT_COST = ?,
					NEW_UNIT_COST = ?,
					SUPPLIER_NAME = ?,
					REFERENCE_NO = ?,
					NOTE = ?,
					STOCK_IN_DATE = ?,
					EDITED_BY = ?,
					EDITED_DT = CURRENT_TIMESTAMP
				WHERE IDNo = ? AND ACTIVE = 1
				`,
				[
					resourceType,
					resourceId,
					qtyAdded,
					prevStock,
					newStock,
					unitCost,
					prevUnitCost,
					newUnitCost,
					data.SUPPLIER_NAME || null,
					data.REFERENCE_NO || null,
					data.NOTE || null,
					data.STOCK_IN_DATE || InventoryModel._todayInPht(),
					data.user_id || null,
					id,
				]
			);

			await connection.commit();
			return {
				stockInId: Number(id),
				branchId,
				resourceType,
				oldResourceType: oldType,
				resourceId,
				qtyAdded,
				prevStock,
				newStock,
				unitCost,
				totalCost: Number((qtyAdded * unitCost).toFixed(2)),
				prevUnitCost,
				newUnitCost,
				stockInDate: data.STOCK_IN_DATE || InventoryModel._todayInPht(),
			};
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	static async deleteStockIn(id, userId) {
		await InventoryModel.ensureSchema();
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [stockInRows] = await connection.execute(
				`
				SELECT IDNo, BRANCH_ID, RESOURCE_TYPE, RESOURCE_ID, QTY_ADDED, UNIT_COST, PREV_UNIT_COST, NEW_UNIT_COST, ACTIVE
				FROM inventory_stock_ins
				WHERE IDNo = ?
				FOR UPDATE
				`,
				[id]
			);
			const current = stockInRows[0] || null;
			if (!current || Number(current.ACTIVE) !== 1) throw new Error('Stock-in record not found');

			const resourceType = current.RESOURCE_TYPE === 'material' ? 'material' : 'product';
			const resourceId = Number(current.RESOURCE_ID);
			const qtyAdded = Number(current.QTY_ADDED || 0);

			if (resourceType === 'product') {
				const [rows] = await connection.execute(
					`SELECT IDNo, STOCK, PRICE, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
					[resourceId]
				);
				const row = rows[0] || null;
				if (!row || Number(row.ACTIVE) !== 1) throw new Error('Product not found');
				const reversed = Number(row.STOCK || 0) - qtyAdded;
				if (reversed < 0) throw new Error('Cannot delete stock-in because inventory is already consumed');
				const computedReversedPrice = InventoryModel._computeAverageAfterRemoving(
					Number(row.STOCK || 0),
					Number(row.PRICE || 0),
					qtyAdded,
					Number(current.UNIT_COST || 0)
				);
				const prevUnitCost = Number(current.PREV_UNIT_COST);
				const newUnitCost = Number(current.NEW_UNIT_COST);
				const currentPrice = Number(row.PRICE || 0);
				const canUseStoredPrev =
					Number.isFinite(prevUnitCost) &&
					Number.isFinite(newUnitCost) &&
					Math.abs(currentPrice - newUnitCost) <= 0.011;
				const reversedPrice = canUseStoredPrev ? prevUnitCost : computedReversedPrice;
				await connection.execute(
					`UPDATE inventory_products SET STOCK = ?, PRICE = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
					[reversed, reversedPrice, userId || null, resourceId]
				);
			} else {
				const [rows] = await connection.execute(
					`SELECT IDNo, STOCK, UNIT_COST, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
					[resourceId]
				);
				const row = rows[0] || null;
				if (!row || Number(row.ACTIVE) !== 1) throw new Error('Material not found');
				const reversed = Number(row.STOCK || 0) - qtyAdded;
				if (reversed < 0) throw new Error('Cannot delete stock-in because inventory is already consumed');
				const computedReversedUnitCost = InventoryModel._computeAverageAfterRemoving(
					Number(row.STOCK || 0),
					Number(row.UNIT_COST || 0),
					qtyAdded,
					Number(current.UNIT_COST || 0)
				);
				const prevUnitCost = Number(current.PREV_UNIT_COST);
				const newUnitCost = Number(current.NEW_UNIT_COST);
				const currentCost = Number(row.UNIT_COST || 0);
				const canUseStoredPrev =
					Number.isFinite(prevUnitCost) &&
					Number.isFinite(newUnitCost) &&
					Math.abs(currentCost - newUnitCost) <= 0.011;
				const reversedUnitCost = canUseStoredPrev ? prevUnitCost : computedReversedUnitCost;
				await connection.execute(
					`UPDATE inventory_materials SET STOCK = ?, UNIT_COST = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
					[reversed, reversedUnitCost, userId || null, resourceId]
				);
			}

			await connection.execute(
				`
				UPDATE inventory_stock_ins
				SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP
				WHERE IDNo = ? AND ACTIVE = 1
				`,
				[userId || null, id]
			);

			await connection.commit();
			return {
				stockInId: Number(id),
				resourceType,
			};
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	static async getAuditTrail(branchId = null, filters = {}) {
		await InventoryModel.ensureSchema();
		const stockParams = [];
		const movementParams = [];
		let stockInWhere = `1=1`;
		let movementWhere = `1=1`;

		if (branchId !== null && branchId !== undefined) {
			stockInWhere += ` AND si.BRANCH_ID = ?`;
			movementWhere += ` AND COALESCE(p.BRANCH_ID, m.BRANCH_ID) = ?`;
			stockParams.push(Number(branchId));
			movementParams.push(Number(branchId));
		}

		if (filters.resourceType === 'product' || filters.resourceType === 'material') {
			stockInWhere += ` AND si.RESOURCE_TYPE = ?`;
			movementWhere += ` AND im.RESOURCE_TYPE = ?`;
			stockParams.push(filters.resourceType);
			movementParams.push(filters.resourceType);
		}

		if (filters.resourceId !== null && filters.resourceId !== undefined && filters.resourceId !== '') {
			stockInWhere += ` AND si.RESOURCE_ID = ?`;
			movementWhere += ` AND im.RESOURCE_ID = ?`;
			stockParams.push(Number(filters.resourceId));
			movementParams.push(Number(filters.resourceId));
		}

		if (filters.search && String(filters.search).trim()) {
			const like = `%${String(filters.search).trim()}%`;
			stockInWhere += ` AND (COALESCE(p.PRODUCT_NAME, m.MATERIAL_NAME, '') LIKE ? OR COALESCE(si.SUPPLIER_NAME, '') LIKE ? OR COALESCE(si.REFERENCE_NO, '') LIKE ?)`;
			movementWhere += ` AND (COALESCE(p.PRODUCT_NAME, m.MATERIAL_NAME, '') LIKE ?)`;
			stockParams.push(like, like, like);
			movementParams.push(like);
		}

		const query = `
			SELECT *
			FROM (
				SELECT
					si.IDNo AS EVENT_ID,
					'stock_in' AS EVENT_TYPE,
					si.BRANCH_ID,
					si.RESOURCE_TYPE,
					si.RESOURCE_ID,
					COALESCE(p.PRODUCT_NAME, m.MATERIAL_NAME, '') AS RESOURCE_NAME,
					COALESCE(p.UNIT, m.UNIT) AS RESOURCE_UNIT,
					si.STOCK_IN_DATE AS EVENT_DATE,
					si.ENCODED_DT AS EVENT_DT,
					si.QTY_ADDED AS QTY_CHANGE,
					si.PREV_STOCK AS STOCK_BEFORE,
					si.NEW_STOCK AS STOCK_AFTER,
					si.PREV_UNIT_COST AS COST_BEFORE,
					si.NEW_UNIT_COST AS COST_AFTER,
					si.UNIT_COST AS TXN_UNIT_COST,
					si.TOTAL_COST AS TXN_TOTAL_COST,
					si.SUPPLIER_NAME,
					si.REFERENCE_NO,
					si.NOTE,
					si.ACTIVE
				FROM inventory_stock_ins si
				LEFT JOIN inventory_products p
					ON si.RESOURCE_TYPE = 'product' AND p.IDNo = si.RESOURCE_ID
				LEFT JOIN inventory_materials m
					ON si.RESOURCE_TYPE = 'material' AND m.IDNo = si.RESOURCE_ID
				WHERE ${stockInWhere}

				UNION ALL

				SELECT
					im.IDNo AS EVENT_ID,
					'stock_out' AS EVENT_TYPE,
					COALESCE(p.BRANCH_ID, m.BRANCH_ID) AS BRANCH_ID,
					im.RESOURCE_TYPE,
					im.RESOURCE_ID,
					COALESCE(p.PRODUCT_NAME, m.MATERIAL_NAME, '') AS RESOURCE_NAME,
					COALESCE(p.UNIT, m.UNIT) AS RESOURCE_UNIT,
					DATE(COALESCE(CONVERT_TZ(im.ENCODED_DT, '+00:00', '+08:00'), im.ENCODED_DT)) AS EVENT_DATE,
					im.ENCODED_DT AS EVENT_DT,
					-1 * im.QTY_DEDUCTED AS QTY_CHANGE,
					im.STOCK_BEFORE AS STOCK_BEFORE,
					im.STOCK_AFTER AS STOCK_AFTER,
					NULL AS COST_BEFORE,
					NULL AS COST_AFTER,
					NULL AS TXN_UNIT_COST,
					NULL AS TXN_TOTAL_COST,
					NULL AS SUPPLIER_NAME,
					CONCAT('ORDER-', im.ORDER_ID) AS REFERENCE_NO,
					CONCAT('Menu deduction (MENU_ID ', im.MENU_ID, ')') AS NOTE,
					1 AS ACTIVE
				FROM inventory_movements im
				LEFT JOIN inventory_products p
					ON im.RESOURCE_TYPE = 'product' AND p.IDNo = im.RESOURCE_ID
				LEFT JOIN inventory_materials m
					ON im.RESOURCE_TYPE = 'material' AND m.IDNo = im.RESOURCE_ID
				WHERE ${movementWhere}
			) t
			ORDER BY t.EVENT_DT DESC, t.EVENT_ID DESC
			LIMIT 1000
		`;

		const [rows] = await pool.execute(query, [...stockParams, ...movementParams]);
		return rows;
	}

	static calculateMenuInventoryMetrics(menus, mappings) {
		const grouped = new Map();
		for (const row of mappings) {
			if (!grouped.has(row.MENU_ID)) grouped.set(row.MENU_ID, []);
			grouped.get(row.MENU_ID).push(row);
		}

		return menus.map((menu) => {
			const deps = grouped.get(menu.IDNo) || [];
			if (deps.length === 0) {
				return {
					...menu,
					INVENTORY_TRACKED: 0,
					INVENTORY_AVAILABLE: 1,
					INVENTORY_STOCK: null,
				};
			}

			let minStock = Number.POSITIVE_INFINITY;
			let valid = true;
			for (const dep of deps) {
				const qtyPerMenu = Number(dep.QUANTITY || 0);
				if (!Number.isFinite(qtyPerMenu) || qtyPerMenu <= 0) {
					valid = false;
					break;
				}

				if (dep.PRODUCT_ID) {
					if (dep.PRODUCT_STOCK === null || dep.PRODUCT_STOCK === undefined || dep.PRODUCT_STATUS !== STATUS_ACTIVE) {
						valid = false;
						break;
					}
					minStock = Math.min(minStock, Number(dep.PRODUCT_STOCK) / qtyPerMenu);
				} else if (dep.MATERIAL_ID) {
					if (dep.MATERIAL_STOCK === null || dep.MATERIAL_STOCK === undefined || dep.MATERIAL_STATUS !== STATUS_ACTIVE) {
						valid = false;
						break;
					}
					minStock = Math.min(minStock, Number(dep.MATERIAL_STOCK) / qtyPerMenu);
				} else {
					valid = false;
					break;
				}
			}

			if (!valid || !Number.isFinite(minStock)) {
				return {
					...menu,
					INVENTORY_TRACKED: 1,
					INVENTORY_AVAILABLE: 0,
					INVENTORY_STOCK: 0,
				};
			}

			return {
				...menu,
				INVENTORY_TRACKED: 1,
				INVENTORY_AVAILABLE: minStock >= 1 ? 1 : 0,
				INVENTORY_STOCK: Number(minStock.toFixed(3)),
			};
		});
	}
	static async getCategories(branchId = null) {
		await InventoryModel.ensureSchema();
		let query = `SELECT * FROM inventory_categories WHERE ACTIVE = 1`;
		const params = [];
		if (branchId !== null && branchId !== undefined) {
			query += ` AND BRANCH_ID = ?`;
			params.push(branchId);
		}
		query += ` ORDER BY CATEGORY_NAME ASC`;
		const [rows] = await pool.execute(query, params);
		return rows;
	}

	static async createCategory(data) {
		await InventoryModel.ensureSchema();
		const query = `
			INSERT INTO inventory_categories (BRANCH_ID, CATEGORY_NAME, DESCRIPTION, ENCODED_BY)
			VALUES (?, ?, ?, ?)
		`;
		const [result] = await pool.execute(query, [
			data.BRANCH_ID,
			data.CATEGORY_NAME,
			data.DESCRIPTION || null,
			data.user_id || null,
		]);
		return result.insertId;
	}

	static async updateCategory(id, data) {
		await InventoryModel.ensureSchema();
		const query = `
			UPDATE inventory_categories SET
				CATEGORY_NAME = ?,
				DESCRIPTION = ?,
				EDITED_BY = ?,
				EDITED_DT = CURRENT_TIMESTAMP
			WHERE IDNo = ? AND ACTIVE = 1
		`;
		const [result] = await pool.execute(query, [
			data.CATEGORY_NAME,
			data.DESCRIPTION || null,
			data.user_id || null,
			id,
		]);
		return result.affectedRows > 0;
	}

	static async deleteCategory(id, userId) {
		await InventoryModel.ensureSchema();
		const query = `UPDATE inventory_categories SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`;
		const [result] = await pool.execute(query, [userId || null, id]);
		return result.affectedRows > 0;
	}
}

module.exports = InventoryModel;

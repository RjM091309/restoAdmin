/**
 * Idempotent DDL: add order_items.LINE_COST if missing (Loyverse-synced line total for sales report parity).
 */
const pool = require('../config/db');

async function ensureOrderItemsLineCostColumn() {
	const connection = await pool.getConnection();
	try {
		const [rows] = await connection.execute(
			`SELECT 1 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'LINE_COST'
			 LIMIT 1`
		);
		if (rows.length > 0) {
			return;
		}
		await connection.execute(
			`ALTER TABLE order_items
			 ADD COLUMN LINE_COST DECIMAL(12,2) NULL DEFAULT NULL
			 COMMENT 'Loyverse line amount (report Product unit price column); optional recipe fallback in analytics'
			 AFTER LINE_TOTAL`
		);
		console.log('[Schema] order_items.LINE_COST created');
		try {
			const loyverseService = require('./loyverseService');
			if (typeof loyverseService.invalidateLineCostColumnCache === 'function') {
				loyverseService.invalidateLineCostColumnCache();
			}
		} catch (_) {}
	} catch (err) {
		console.error('[Schema] ensure order_items.LINE_COST failed:', err.message || err);
	} finally {
		connection.release();
	}
}

/**
 * orders.FLOOR ('gf' / '2f' / NULL): the floor an order belongs to, stamped at
 * creation (see OrderModel.create). Lets floor-scoped tablet accounts filter
 * orders that have no table (takeout) and orders on tables with no FLOOR set.
 */
async function ensureOrdersFloorColumn() {
	const connection = await pool.getConnection();
	try {
		const [rows] = await connection.execute(
			`SELECT 1 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'FLOOR'
			 LIMIT 1`
		);
		if (rows.length > 0) {
			return;
		}
		await connection.execute(
			`ALTER TABLE orders
			 ADD COLUMN FLOOR VARCHAR(10) NULL DEFAULT NULL
			 AFTER TABLE_ID`
		);
		console.log('[Schema] orders.FLOOR created');
	} catch (err) {
		console.error('[Schema] ensure orders.FLOOR failed:', err.message || err);
	} finally {
		connection.release();
	}
}

/**
 * user_info.ACTIVE_SESSION_ID (single-device login lock) and LAST_SEEN_AT (last authenticated
 * tablet request — the tablet login picker hides accounts seen in the last few minutes).
 */
async function ensureUserSessionColumns() {
	const connection = await pool.getConnection();
	try {
		const [rows] = await connection.execute(
			`SELECT COLUMN_NAME FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_info'
			   AND COLUMN_NAME IN ('ACTIVE_SESSION_ID', 'LAST_SEEN_AT')`
		);
		const existing = new Set(rows.map((r) => String(r.COLUMN_NAME).toUpperCase()));
		if (!existing.has('ACTIVE_SESSION_ID')) {
			await connection.execute(
				`ALTER TABLE user_info ADD COLUMN ACTIVE_SESSION_ID VARCHAR(64) NULL DEFAULT NULL`
			);
			console.log('[Schema] user_info.ACTIVE_SESSION_ID created');
		}
		if (!existing.has('LAST_SEEN_AT')) {
			await connection.execute(
				`ALTER TABLE user_info ADD COLUMN LAST_SEEN_AT DATETIME NULL DEFAULT NULL`
			);
			console.log('[Schema] user_info.LAST_SEEN_AT created');
		}
	} catch (err) {
		console.error('[Schema] ensure user_info session columns failed:', err.message || err);
	} finally {
		connection.release();
	}
}

/**
 * order_room_charges: one row per room an order used (KTV / VIP rooms with a ROOM_CHARGE),
 * so a bill moved between rooms shows where each part of its room charge was made.
 * The open row (ENDED_AT NULL) is the room the order is in now. See OrderRoomChargeModel.
 */
async function ensureOrderRoomChargesTable() {
	const connection = await pool.getConnection();
	try {
		await connection.query(`
			CREATE TABLE IF NOT EXISTS order_room_charges (
				IDNo INT NOT NULL AUTO_INCREMENT,
				ORDER_ID INT NOT NULL,
				BRANCH_ID INT NULL,
				TABLE_ID INT NULL,
				TABLE_NUMBER VARCHAR(100) NULL,
				RATE DECIMAL(12,2) NOT NULL DEFAULT 0,
				HOURS DECIMAL(6,2) NOT NULL DEFAULT 0,
				AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
				STARTED_AT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				ENDED_AT DATETIME NULL DEFAULT NULL,
				ENCODED_BY INT NULL,
				ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				EDITED_BY INT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_orc_order (ORDER_ID)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`);
	} catch (err) {
		console.error('[Schema] ensure order_room_charges failed:', err.message || err);
	} finally {
		connection.release();
	}
}

/**
 * order_activity_logs: what each waiter / cashier tablet did to an order (new
 * order, items added / edited, room charge, transfer, confirm, cancel, settle)
 * — the cashier app's Activity tab. See OrderActivityLogModel.
 */
async function ensureOrderActivityLogsTable() {
	const connection = await pool.getConnection();
	try {
		await connection.query(`
			CREATE TABLE IF NOT EXISTS order_activity_logs (
				IDNo INT NOT NULL AUTO_INCREMENT,
				BRANCH_ID INT NULL,
				ORDER_ID INT NULL,
				ORDER_NO VARCHAR(64) NULL,
				TABLE_NUMBER VARCHAR(100) NULL,
				FLOOR VARCHAR(10) NULL,
				ACTION VARCHAR(32) NOT NULL,
				SUMMARY VARCHAR(255) NOT NULL,
				DETAILS TEXT NULL,
				AMOUNT DECIMAL(12,2) NULL,
				USER_ID INT NULL,
				USERNAME VARCHAR(100) NULL,
				USER_FULLNAME VARCHAR(150) NULL,
				USER_ROLE VARCHAR(50) NULL,
				SYNCED_LATE TINYINT(1) NOT NULL DEFAULT 0,
				CREATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (IDNo),
				KEY idx_oal_branch_dt (BRANCH_ID, CREATED_DT),
				KEY idx_oal_order (ORDER_ID)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`);
		// Installs that created the table before SYNCED_LATE existed.
		const [cols] = await connection.execute(
			`SELECT 1 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_activity_logs' AND COLUMN_NAME = 'SYNCED_LATE'
			 LIMIT 1`
		);
		if (cols.length === 0) {
			await connection.execute(
				'ALTER TABLE order_activity_logs ADD COLUMN SYNCED_LATE TINYINT(1) NOT NULL DEFAULT 0 AFTER USER_ROLE'
			);
		}
	} catch (err) {
		console.error('[Schema] ensure order_activity_logs failed:', err.message || err);
	} finally {
		connection.release();
	}
}

async function ensureReceiptScanHistoryTable() {
	const connection = await pool.getConnection();
	try {
		const [rows] = await connection.execute(
			`SELECT 1 FROM information_schema.TABLES
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt_scan_history'
			 LIMIT 1`
		);
		if (rows.length === 0) {
			// Align to existing installs: store image as path (varchar), not blob.
			await connection.query(`
				CREATE TABLE receipt_scan_history (
					IDNo INT NOT NULL AUTO_INCREMENT,
					BRANCH_ID INT NOT NULL,
					ORDER_ID INT(11) NULL,
					RECEIPT_IMAGE VARCHAR(255) NULL,
					RECEIPT_GRAND_TOTAL DECIMAL(14, 2) NULL,
					SOURCE VARCHAR(255) NOT NULL DEFAULT 'receiptscan',
					ENCODED_BY INT NULL,
					ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (IDNo),
					KEY idx_rsh_branch_dt (BRANCH_ID, ENCODED_DT),
					KEY idx_rsh_encoded_dt (ENCODED_DT),
					KEY idx_rsh_order_id (ORDER_ID),
					CONSTRAINT fk_receipt_order FOREIGN KEY (ORDER_ID) REFERENCES orders(IDNo)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
			`);
			console.log('[Schema] receipt_scan_history created');
			return;
		}

		// Table exists: align to ORDER_ID FK schema.
		const [cols] = await connection.execute(
			`SELECT COLUMN_NAME, DATA_TYPE
			 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt_scan_history'`
		);
		const byName = new Set(cols.map((c) => String(c.COLUMN_NAME).toUpperCase()));

		// 1) Rename ORDER_NO -> ORDER_ID (if needed)
		if (!byName.has('ORDER_ID') && byName.has('ORDER_NO')) {
			try {
				await connection.query('SET FOREIGN_KEY_CHECKS = 0');
				await connection.execute(`ALTER TABLE receipt_scan_history CHANGE ORDER_NO ORDER_ID INT(11) NULL`);
			} finally {
				await connection.query('SET FOREIGN_KEY_CHECKS = 1');
			}
			console.log('[Schema] receipt_scan_history.ORDER_NO renamed to ORDER_ID');
		}

		// 2) Add ORDER_ID column if missing
		if (!byName.has('ORDER_ID')) {
			await connection.execute(`ALTER TABLE receipt_scan_history ADD COLUMN ORDER_ID INT(11) NULL AFTER BRANCH_ID`);
			console.log('[Schema] receipt_scan_history.ORDER_ID created');
		}

		// 3) Add FK if missing
		const [fkRows] = await connection.execute(
			`SELECT CONSTRAINT_NAME
			 FROM information_schema.KEY_COLUMN_USAGE
			 WHERE TABLE_SCHEMA = DATABASE()
			   AND TABLE_NAME = 'receipt_scan_history'
			   AND COLUMN_NAME = 'ORDER_ID'
			   AND REFERENCED_TABLE_NAME = 'orders'
			   AND REFERENCED_COLUMN_NAME = 'IDNo'
			 LIMIT 1`
		);
		if (!Array.isArray(fkRows) || fkRows.length === 0) {
			try {
				await connection.query('SET FOREIGN_KEY_CHECKS = 0');
				await connection.execute(
					`ALTER TABLE receipt_scan_history
					 ADD CONSTRAINT fk_receipt_order
					 FOREIGN KEY (ORDER_ID) REFERENCES orders(IDNo)`
				);
			} finally {
				await connection.query('SET FOREIGN_KEY_CHECKS = 1');
			}
			console.log('[Schema] receipt_scan_history fk_receipt_order created');
		}
	} catch (err) {
		console.error('[Schema] ensure receipt_scan_history failed:', err.message || err);
	} finally {
		connection.release();
	}
}

async function ensureTelegramSettingsTable() {
	try {
		const TelegramSettingsModel = require('../models/telegramSettingsModel');
		await TelegramSettingsModel.ensureSchema();
	} catch (err) {
		console.error('[Schema] ensure telegram_settings failed:', err.message || err);
	}
}

/**
 * UI allows BANK; older DBs may only have enum('CASH','GCASH','MAYA','CARD').
 */
async function ensureBankPaymentMethodEnum() {
	const tables = ['billing', 'payment_transactions'];
	const connection = await pool.getConnection();
	try {
		for (const tableName of tables) {
			const [cols] = await connection.execute(
				`SELECT COLUMN_TYPE
				 FROM information_schema.COLUMNS
				 WHERE TABLE_SCHEMA = DATABASE()
				   AND TABLE_NAME = ?
				   AND COLUMN_NAME = 'PAYMENT_METHOD'
				 LIMIT 1`,
				[tableName]
			);
			if (!cols.length) continue;

			const columnType = String(cols[0].COLUMN_TYPE || '');
			const match = columnType.match(/^enum\((.*)\)$/i);
			if (!match || /'BANK'/i.test(columnType)) continue;

			await connection.execute(
				`ALTER TABLE \`${tableName}\`
				 MODIFY COLUMN PAYMENT_METHOD enum(${match[1]},'BANK')
				 CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL`
			);
			console.log(`[Schema] ${tableName}.PAYMENT_METHOD now includes BANK`);
		}
	} catch (err) {
		console.error('[Schema] ensure BANK payment method enum failed:', err.message || err);
	} finally {
		connection.release();
	}
}

/**
 * Critical analytics indexes — without these, category/top-selling scan all order_items.
 * Also covering indexes so list pages stay fast as order/billing/inventory grow.
 */
async function ensureAnalyticsPerformanceIndexes() {
	const connection = await pool.getConnection();
	const indexes = [
		{
			table: 'orders',
			name: 'idx_orders_branch_encoded',
			ddl: 'CREATE INDEX idx_orders_branch_encoded ON orders (BRANCH_ID, ENCODED_DT)',
		},
		{
			table: 'orders',
			name: 'idx_orders_branch_status_encoded',
			ddl: 'CREATE INDEX idx_orders_branch_status_encoded ON orders (BRANCH_ID, STATUS, ENCODED_DT)',
		},
		{
			table: 'menu',
			name: 'idx_menu_branch_active',
			ddl: 'CREATE INDEX idx_menu_branch_active ON menu (BRANCH_ID, ACTIVE)',
		},
		{
			table: 'order_items',
			name: 'idx_order_items_order_id',
			ddl: 'CREATE INDEX idx_order_items_order_id ON order_items (ORDER_ID)',
		},
		{
			table: 'order_items',
			name: 'idx_order_items_menu_id',
			ddl: 'CREATE INDEX idx_order_items_menu_id ON order_items (MENU_ID)',
		},
		{
			table: 'billing',
			name: 'idx_billing_branch_encoded',
			ddl: 'CREATE INDEX idx_billing_branch_encoded ON billing (BRANCH_ID, ENCODED_DT)',
		},
		{
			table: 'billing',
			name: 'idx_billing_status_encoded',
			ddl: 'CREATE INDEX idx_billing_status_encoded ON billing (STATUS, ENCODED_DT)',
		},
		{
			table: 'billing',
			name: 'idx_billing_order_idno',
			ddl: 'CREATE INDEX idx_billing_order_idno ON billing (ORDER_ID, IDNo)',
		},
		{
			table: 'expenses',
			name: 'idx_expenses_branch_encoded',
			ddl: 'CREATE INDEX idx_expenses_branch_encoded ON expenses (BRANCH_ID, ENCODED_DT)',
		},
		{
			table: 'inventory',
			name: 'idx_inventory_branch_active_ing',
			ddl: 'CREATE INDEX idx_inventory_branch_active_ing ON inventory (BRANCH_ID, ACTIVE, INGREDIENT_ID)',
		},
		{
			table: 'ingredients',
			name: 'idx_ingredients_branch_active_cat',
			ddl: 'CREATE INDEX idx_ingredients_branch_active_cat ON ingredients (BRANCH_ID, ACTIVE, MASTER_CAT_ID)',
		},
		{
			table: 'master_categories',
			name: 'idx_master_categories_branch_active_op',
			ddl: 'CREATE INDEX idx_master_categories_branch_active_op ON master_categories (BRANCH_ID, ACTIVE, OP_CAT_ID)',
		},
	];
	try {
		for (const idx of indexes) {
			const [rows] = await connection.execute(
				`SELECT 1 FROM information_schema.STATISTICS
				 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
				 LIMIT 1`,
				[idx.table, idx.name],
			);
			if (rows.length > 0) continue;
			try {
				await connection.query(idx.ddl);
				console.log(`[Schema] ${idx.name} created on ${idx.table}`);
			} catch (err) {
				console.warn(`[Schema] ${idx.name} skipped:`, err.message || err);
			}
		}
	} catch (err) {
		console.error('[Schema] ensureAnalyticsPerformanceIndexes failed:', err.message || err);
	} finally {
		connection.release();
	}
}

module.exports = {
	ensureOrderItemsLineCostColumn,
	ensureOrdersFloorColumn,
	ensureUserSessionColumns,
	ensureOrderRoomChargesTable,
	ensureOrderActivityLogsTable,
	ensureReceiptScanHistoryTable,
	ensureTelegramSettingsTable,
	ensureBankPaymentMethodEnum,
	ensureAnalyticsPerformanceIndexes,
};

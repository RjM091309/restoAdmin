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

module.exports = { ensureOrderItemsLineCostColumn, ensureReceiptScanHistoryTable };

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

module.exports = { ensureOrderItemsLineCostColumn };

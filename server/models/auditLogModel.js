// ============================================
// AUDIT LOG MODEL
// ============================================
// File: models/auditLogModel.js
// Description: Database operations for audit logs
// ============================================

const pool = require('../config/db');

class AuditLogModel {
	// Create audit log entry
	static async create(data) {
		const {
			user_id,
			branch_id,
			action,
			table_name,
			record_id
		} = data;

		const query = `
			INSERT INTO audit_logs (
				USER_ID,
				BRANCH_ID,
				ACTION,
				TABLE_NAME,
				RECORD_ID
			) VALUES (?, ?, ?, ?, ?)
		`;

		await pool.execute(query, [
			user_id || null,
			branch_id || null,
			action,
			table_name || null,
			record_id || null
		]);
	}

	// Get audit logs with filters
	static async getAll(filters = {}) {
		let query = `
			SELECT 
				al.IDNo,
				al.USER_ID,
				al.BRANCH_ID,
				al.ACTION,
				al.TABLE_NAME,
				al.RECORD_ID,
				al.CREATED_DT,
				u.USERNAME,
				u.FIRSTNAME,
				u.LASTNAME,
				b.BRANCH_NAME
			FROM audit_logs al
			LEFT JOIN user_info u ON u.IDNo = al.USER_ID
			LEFT JOIN branches b ON b.IDNo = al.BRANCH_ID
			WHERE 1=1
		`;

		const params = [];

		if (filters.user_id) {
			query += ` AND al.USER_ID = ?`;
			params.push(filters.user_id);
		}

		if (filters.branch_id) {
			query += ` AND al.BRANCH_ID = ?`;
			params.push(filters.branch_id);
		}

		if (filters.table_name) {
			query += ` AND al.TABLE_NAME = ?`;
			params.push(filters.table_name);
		}

		if (filters.action) {
			query += ` AND al.ACTION = ?`;
			params.push(filters.action);
		}

		if (filters.start_date) {
			query += ` AND al.CREATED_DT >= ?`;
			params.push(filters.start_date);
		}

		if (filters.end_date) {
			query += ` AND al.CREATED_DT <= ?`;
			params.push(filters.end_date);
		}

		query += ` ORDER BY al.CREATED_DT DESC LIMIT ? OFFSET ?`;
		const limit = filters.limit || 100;
		const offset = filters.offset || 0;
		params.push(limit, offset);

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	// Get audit logs by branch
	static async getByBranchId(branchId, limit = 100) {
		return this.getAll({ branch_id: branchId, limit });
	}

	// Get audit logs by user
	static async getByUserId(userId, limit = 100) {
		return this.getAll({ user_id: userId, limit });
	}
}

module.exports = AuditLogModel;


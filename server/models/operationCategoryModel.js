// ============================================
// OPERATION CATEGORY MODEL
// ============================================
// File: models/operationCategoryModel.js
// Description: Database operations for operation_category table
// ============================================

const pool = require('../config/db');

class OperationCategoryModel {
	// Get all active operation categories, optionally filtered by branch
	static async getAll(branchId = null) {
		let query = `
			SELECT
				IDNo,
				BRANCH_ID,
				NAME,
				DESCRIPTION,
				ACTIVE,
				ENCODED_BY,
				ENCODED_DT,
				EDITED_BY,
				EDITED_DT
			FROM operation_category
			WHERE ACTIVE = 1
		`;

		const params = [];

		if (branchId !== null && branchId !== undefined) {
			query += ' AND BRANCH_ID = ?';
			params.push(branchId);
		}

		query += ' ORDER BY NAME ASC, IDNo ASC';

		const [rows] = await pool.execute(query, params);
		return rows;
	}

	// Create operation category
	static async create(data) {
		const encodedBy = data.ENCODED_BY != null ? Number(data.ENCODED_BY) : 0;
		const [result] = await pool.execute(
			`INSERT INTO operation_category (BRANCH_ID, NAME, DESCRIPTION, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, 1, ?, NOW())`,
			[
				data.BRANCH_ID != null ? Number(data.BRANCH_ID) : null,
				String(data.NAME || '').trim(),
				data.DESCRIPTION != null ? String(data.DESCRIPTION).trim() : null,
				encodedBy,
			]
		);
		return result.insertId;
	}

	// Update operation category
	static async update(id, data) {
		const editedBy = data.EDITED_BY != null ? Number(data.EDITED_BY) : 0;
		const [result] = await pool.execute(
			`UPDATE operation_category
			 SET NAME = ?, DESCRIPTION = ?, EDITED_BY = ?, EDITED_DT = NOW()
			 WHERE IDNo = ? AND ACTIVE = 1`,
			[
				String(data.NAME || '').trim(),
				data.DESCRIPTION != null ? String(data.DESCRIPTION).trim() : null,
				editedBy,
				Number(id),
			]
		);
		return result.affectedRows > 0;
	}

	// Soft delete (set ACTIVE = 0)
	static async setInactive(id) {
		const [result] = await pool.execute(
			`UPDATE operation_category SET ACTIVE = 0, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1`,
			[Number(id)]
		);
		return result.affectedRows > 0;
	}
}

module.exports = OperationCategoryModel;


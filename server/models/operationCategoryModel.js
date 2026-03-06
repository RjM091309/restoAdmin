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
}

module.exports = OperationCategoryModel;


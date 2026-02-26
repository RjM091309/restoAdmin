const pool = require('../config/db');

class BranchModel {
	static _schemaReady = false;
	static _schemaPromise = null;

	static async ensureSchema() {
		if (BranchModel._schemaReady) return;
		if (BranchModel._schemaPromise) return BranchModel._schemaPromise;

		BranchModel._schemaPromise = (async () => {
			await pool.execute(`
				CREATE TABLE IF NOT EXISTS branches (
					IDNo INT AUTO_INCREMENT PRIMARY KEY,
					BRANCH_CODE VARCHAR(20) NULL,
					BRANCH_NAME VARCHAR(120) NOT NULL,
					ADDRESS VARCHAR(255) NULL,
					PHONE VARCHAR(40) NULL,
					ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
					CREATED_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
					INDEX idx_branches_active (ACTIVE),
					INDEX idx_branches_branch_code (BRANCH_CODE)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);

			BranchModel._schemaReady = true;
			BranchModel._schemaPromise = null;
		})().catch((error) => {
			BranchModel._schemaPromise = null;
			throw error;
		});

		return BranchModel._schemaPromise;
	}

	static async getAllActive() {
		await BranchModel.ensureSchema();
		const [rows] = await pool.execute(
			`
			SELECT IDNo, BRANCH_CODE, BRANCH_NAME, ADDRESS, PHONE, ACTIVE, CREATED_DT
			FROM branches
			WHERE ACTIVE = 1
			ORDER BY BRANCH_NAME ASC, IDNo ASC
			`
		);
		return rows;
	}

	static async getById(id) {
		await BranchModel.ensureSchema();
		const [rows] = await pool.execute(
			`SELECT * FROM branches WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
			[Number(id)]
		);
		return rows[0] || null;
	}

	static async getByCode(code) {
		await BranchModel.ensureSchema();
		const [rows] = await pool.execute(
			`SELECT * FROM branches WHERE BRANCH_CODE = ? AND ACTIVE = 1 LIMIT 1`,
			[String(code)]
		);
		return rows[0] || null;
	}

	static async create(data) {
		await BranchModel.ensureSchema();
		const [result] = await pool.execute(
			`
			INSERT INTO branches (
				BRANCH_CODE,
				BRANCH_NAME,
				ADDRESS,
				PHONE,
				ACTIVE,
				CREATED_DT
			) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
			`,
			[
				data.BRANCH_CODE ? String(data.BRANCH_CODE).trim() : null,
				String(data.BRANCH_NAME).trim(),
				data.ADDRESS ? String(data.ADDRESS).trim() : null,
				data.PHONE ? String(data.PHONE).trim() : null,
			]
		);
		return result.insertId;
	}

	static async update(id, data) {
		await BranchModel.ensureSchema();
		const [result] = await pool.execute(
			`
			UPDATE branches
			SET
				BRANCH_CODE = ?,
				BRANCH_NAME = ?,
				ADDRESS = ?,
				PHONE = ?
			WHERE IDNo = ? AND ACTIVE = 1
			`,
			[
				data.BRANCH_CODE ? String(data.BRANCH_CODE).trim() : null,
				String(data.BRANCH_NAME).trim(),
				data.ADDRESS ? String(data.ADDRESS).trim() : null,
				data.PHONE ? String(data.PHONE).trim() : null,
				Number(id),
			]
		);
		return result.affectedRows > 0;
	}

	static async delete(id) {
		await BranchModel.ensureSchema();
		const [result] = await pool.execute(
			`UPDATE branches SET ACTIVE = 0 WHERE IDNo = ? AND ACTIVE = 1`,
			[Number(id)]
		);
		return result.affectedRows > 0;
	}
}

module.exports = BranchModel;


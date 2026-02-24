const pool = require('../config/db');

class BranchModel {
    static async getAllActive() {
        const [rows] = await pool.execute(
            'SELECT IDNo, BRANCH_CODE, BRANCH_NAME FROM branches WHERE ACTIVE = 1'
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM branches WHERE IDNo = ? AND ACTIVE = 1',
            [id]
        );
        return rows[0];
    }
}

module.exports = BranchModel;

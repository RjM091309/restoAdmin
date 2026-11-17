// ============================================
// BRANCH FEATURE FLAG MODEL
// ============================================
// Per-branch switches for actions inside a page (as opposed to which sidebar
// items a branch sees — see branchSidebarPermissionModel.js). Set by admins
// in Control Panel → Branches, under the parent sidebar item.
//
// A flag with no row is OFF. Administrators are not bound by these flags.
// Keep FLAGS in sync with src/constants/branchFeatureFlags.ts.
// ============================================

const pool = require('../config/db');

const FLAGS = ['orders_update_encoded_dt', 'orders_soft_delete'];

/**
 * Branches that already had these powers before the flags existed (Blue Moon's
 * "bmoon" account was hardcoded as an order meta editor). Seeded ON once, when
 * the table is first created; admins can switch them off afterwards.
 */
const INITIAL_ENABLED = { 3: ['orders_update_encoded_dt', 'orders_soft_delete'] };

let schemaPromise = null;

function ensureSchema() {
	if (!schemaPromise) {
		schemaPromise = (async () => {
			const [existing] = await pool.query(
				`SELECT 1 FROM information_schema.TABLES
				 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'branch_feature_flags' LIMIT 1`
			);
			await pool.query(`
				CREATE TABLE IF NOT EXISTS branch_feature_flags (
					branch_id INT NOT NULL,
					flag_key VARCHAR(64) NOT NULL,
					enabled TINYINT(1) NOT NULL DEFAULT 0,
					updated_dt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
					PRIMARY KEY (branch_id, flag_key)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
			`);
			if (existing.length === 0) {
				for (const [branchId, flags] of Object.entries(INITIAL_ENABLED)) {
					for (const flag of flags) {
						await pool.query(
							`INSERT IGNORE INTO branch_feature_flags (branch_id, flag_key, enabled)
							 SELECT ?, ?, 1 FROM branches WHERE IDNo = ?`,
							[Number(branchId), flag, Number(branchId)]
						);
					}
				}
			}
		})().catch((err) => {
			schemaPromise = null;
			throw err;
		});
	}
	return schemaPromise;
}

const emptyFlags = () => Object.fromEntries(FLAGS.map((f) => [f, false]));

/** { flag_key: boolean } for one branch (missing rows = false). */
async function getByBranchId(branchId) {
	await ensureSchema();
	const [rows] = await pool.query(
		`SELECT flag_key, enabled FROM branch_feature_flags WHERE branch_id = ?`,
		[Number(branchId)]
	);
	const out = emptyFlags();
	for (const r of rows) {
		if (FLAGS.includes(r.flag_key)) out[r.flag_key] = Number(r.enabled) === 1;
	}
	return out;
}

/** { [branchId]: { flag_key: boolean } } for the given branches. */
async function getAllByBranches(branchIds) {
	const out = {};
	for (const id of branchIds || []) out[String(id)] = emptyFlags();
	if (!branchIds || branchIds.length === 0) return out;
	await ensureSchema();
	const [rows] = await pool.query(
		`SELECT branch_id, flag_key, enabled FROM branch_feature_flags WHERE branch_id IN (?)`,
		[branchIds.map(Number)]
	);
	for (const r of rows) {
		const id = String(r.branch_id);
		if (out[id] && FLAGS.includes(r.flag_key)) out[id][r.flag_key] = Number(r.enabled) === 1;
	}
	return out;
}

/** Saves { [branchId]: { flag_key: boolean } }; unknown flags / branch 'all' are ignored. */
async function setAll(flagsByBranch) {
	if (!flagsByBranch || typeof flagsByBranch !== 'object') return;
	await ensureSchema();
	for (const [branchId, flags] of Object.entries(flagsByBranch)) {
		const id = Number(branchId);
		if (!Number.isInteger(id) || id <= 0 || !flags || typeof flags !== 'object') continue;
		for (const flag of FLAGS) {
			if (!(flag in flags)) continue;
			await pool.query(
				`INSERT INTO branch_feature_flags (branch_id, flag_key, enabled) VALUES (?, ?, ?)
				 ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
				[id, flag, flags[flag] ? 1 : 0]
			);
		}
	}
}

async function isEnabled(branchId, flag) {
	const flags = await getByBranchId(branchId);
	return !!flags[flag];
}

module.exports = {
	FLAGS,
	ensureSchema,
	getByBranchId,
	getAllByBranches,
	setAll,
	isEnabled,
};

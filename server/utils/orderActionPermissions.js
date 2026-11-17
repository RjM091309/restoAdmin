// ============================================
// ORDER ACTION PERMISSIONS
// ============================================
// Who may update an order's encoded date / soft-delete it:
// - Administrators (permissions = 1): any branch, always.
// - Anyone else: only orders of their own branch, and only while that branch
//   has the Orders page and the matching sub-toggle switched on in
//   Control Panel → Branches (branch_feature_flags).
// ============================================

const BranchFeatureFlagModel = require('../models/branchFeatureFlagModel');
const BranchSidebarPermissionModel = require('../models/branchSidebarPermissionModel');
const UserBranchModel = require('../models/userBranchModel');

const ORDER_ACTION_FLAGS = {
	update_encoded_dt: 'orders_update_encoded_dt',
	soft_delete: 'orders_soft_delete',
};

const isAdminUser = (req) => Number(req.user?.permissions ?? req.session?.permissions) === 1;

async function userBranchIds(req) {
	const ids = new Set();
	if (req.user?.branch_id != null) ids.add(Number(req.user.branch_id));
	if (ids.size === 0 && req.user?.user_id) {
		const branches = await UserBranchModel.getBranchesByUserId(req.user.user_id).catch(() => []);
		for (const b of branches || []) ids.add(Number(b.IDNo));
	}
	return ids;
}

/**
 * { update_encoded_dt: boolean, soft_delete: boolean } for the request user
 * on one branch (null branch = "all branches", which only admins get).
 */
async function getOrderActionPermissions(req, branchId) {
	const none = { update_encoded_dt: false, soft_delete: false };
	if (!req.user) return none;
	if (isAdminUser(req)) return { update_encoded_dt: true, soft_delete: true };

	const id = Number(branchId);
	if (!Number.isInteger(id) || id <= 0) return none;
	if (!(await userBranchIds(req)).has(id)) return none;

	const [features, flags] = await Promise.all([
		BranchSidebarPermissionModel.getByBranchId(id),
		BranchFeatureFlagModel.getByBranchId(id),
	]);
	if (!features.includes('orders')) return none;
	return {
		update_encoded_dt: !!flags[ORDER_ACTION_FLAGS.update_encoded_dt],
		soft_delete: !!flags[ORDER_ACTION_FLAGS.soft_delete],
	};
}

/** Whether the request user may do `action` ('update_encoded_dt' | 'soft_delete') on that branch's orders. */
async function canDoOrderAction(req, branchId, action) {
	const perms = await getOrderActionPermissions(req, branchId);
	return !!perms[action];
}

module.exports = {
	ORDER_ACTION_FLAGS,
	isAdminUser,
	getOrderActionPermissions,
	canDoOrderAction,
};

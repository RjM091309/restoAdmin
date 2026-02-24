// ============================================
// LOYVERSE CONTROLLER
// ============================================
// File: controllers/loyverseController.js
// Description: Controller for Loyverse sync operations
// ============================================

const loyverseService = require('../utils/loyverseService');
const ApiResponse = require('../utils/apiResponse');

class LoyverseController {
	/**
	 * Get sync status
	 * GET /api/loyverse/status
	 */
	static async getSyncStatus(req, res) {
		try {
			const status = loyverseService.getSyncStatus();
			return ApiResponse.success(res, status, 'Sync status retrieved successfully');
		} catch (error) {
			return ApiResponse.error(res, error.message, 500);
		}
	}

	/**
	 * Manually trigger sync
	 * POST /api/loyverse/sync
	 */
	static async syncReceipts(req, res) {
		try {
			const branchId = req.body.branch_id || req.query.branch_id || null;
			const limit = parseInt(req.body.limit) || 50;
			// Optional safety limits (0 = unlimited)
			const maxReceipts = req.body.max_receipts ?? req.body.maxReceipts ?? req.query.max_receipts ?? req.query.maxReceipts;
			const maxPages = req.body.max_pages ?? req.body.maxPages ?? req.query.max_pages ?? req.query.maxPages;
			const incremental = req.body.incremental ?? req.body.realtime ?? req.query.incremental ?? req.query.realtime;
			const since = req.body.since ?? req.body.from ?? req.query.since ?? req.query.from;

			const stats = await loyverseService.syncAllReceipts(branchId, limit, { maxReceipts, maxPages, incremental, since });
			
			return ApiResponse.success(res, {
				stats,
				message: `Sync completed: ${stats.totalInserted} inserted, ${stats.totalUpdated} updated, ${stats.totalErrors} errors`
			}, 'Sync completed successfully');
		} catch (error) {
			return ApiResponse.error(res, error.message, 500);
		}
	}

	/**
	 * Start auto-sync
	 * POST /api/loyverse/auto-sync/start
	 */
	static async startAutoSync(req, res) {
		try {
			const branchId = req.body.branch_id || req.query.branch_id || null;
			const interval = parseInt(req.body.interval) || null;

			loyverseService.startAutoSync(branchId, interval);
			
			return ApiResponse.success(res, {
				message: 'Auto-sync started successfully',
				interval: interval || loyverseService.syncInterval
			}, 'Auto-sync started');
		} catch (error) {
			return ApiResponse.error(res, error.message, 500);
		}
	}

	/**
	 * Stop auto-sync
	 * POST /api/loyverse/auto-sync/stop
	 */
	static async stopAutoSync(req, res) {
		try {
			loyverseService.stopAutoSync();
			return ApiResponse.success(res, { message: 'Auto-sync stopped successfully' }, 'Auto-sync stopped');
		} catch (error) {
			return ApiResponse.error(res, error.message, 500);
		}
	}
}

module.exports = LoyverseController;


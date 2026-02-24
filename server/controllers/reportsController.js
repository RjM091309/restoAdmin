// ============================================
// REPORTS CONTROLLER
// ============================================
// File: controllers/reportsController.js
// Description: Handles reports and analytics business logic
// ============================================

const ReportsModel = require('../models/reportsModel');
const ApiResponse = require('../utils/apiResponse');

class ReportsController {
	// Get revenue report
	static async getRevenueReport(req, res) {
		try {
			const { period = 'daily', start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			if (!['daily', 'weekly', 'monthly'].includes(period)) {
				return ApiResponse.badRequest(res, 'Period must be daily, weekly, or monthly');
			}

			const report = await ReportsModel.getRevenueReport(period, start_date, end_date, branchId);

			return ApiResponse.success(res, {
				period,
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report,
				total_revenue: report.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0),
				total_orders: report.reduce((sum, item) => sum + parseInt(item.order_count || 0), 0)
			}, 'Revenue report retrieved successfully');
		} catch (error) {
			console.error('Error fetching revenue report:', error);
			return ApiResponse.error(res, 'Failed to fetch revenue report', 500, error.message);
		}
	}

	// Get order report
	static async getOrderReport(req, res) {
		try {
			const { start_date, end_date, status } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getOrderReport(start_date, end_date, branchId, status ? parseInt(status) : null);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				status: status ? parseInt(status) : null,
				data: report
			}, 'Order report retrieved successfully');
		} catch (error) {
			console.error('Error fetching order report:', error);
			return ApiResponse.error(res, 'Failed to fetch order report', 500, error.message);
		}
	}

	// Get popular menu items
	static async getPopularMenuItems(req, res) {
		try {
			const { start_date, end_date, limit = 10 } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getPopularMenuItems(start_date, end_date, branchId, parseInt(limit));

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				limit: parseInt(limit),
				data: report
			}, 'Popular menu items retrieved successfully');
		} catch (error) {
			console.error('Error fetching popular menu items:', error);
			return ApiResponse.error(res, 'Failed to fetch popular menu items', 500, error.message);
		}
	}

	// Get daily sales by product (for chart)
	static async getDailySalesByProduct(req, res) {
		try {
			const { start_date, end_date, limit = 5 } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getDailySalesByProduct(start_date, end_date, branchId, parseInt(limit));

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				limit: parseInt(limit),
				data: report
			}, 'Daily sales by product retrieved successfully');
		} catch (error) {
			console.error('Error fetching daily sales by product:', error);
			return ApiResponse.error(res, 'Failed to fetch daily sales by product', 500, error.message);
		}
	}

	// Get table utilization report
	static async getTableUtilizationReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getTableUtilizationReport(start_date, end_date, branchId);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Table utilization report retrieved successfully');
		} catch (error) {
			console.error('Error fetching table utilization report:', error);
			return ApiResponse.error(res, 'Failed to fetch table utilization report', 500, error.message);
		}
	}

	// Get employee performance report
	static async getEmployeePerformanceReport(req, res) {
		try {
			const { start_date, end_date, employee_id } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getEmployeePerformanceReport(
				start_date,
				end_date,
				branchId,
				employee_id ? parseInt(employee_id) : null
			);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				employee_id: employee_id ? parseInt(employee_id) : null,
				data: report
			}, 'Employee performance report retrieved successfully');
		} catch (error) {
			console.error('Error fetching employee performance report:', error);
			return ApiResponse.error(res, 'Failed to fetch employee performance report', 500, error.message);
		}
	}

	// Get sales hourly summary (Total Sales Detail modal)
	static async getSalesHourlySummary(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getSalesHourlySummary(start_date, end_date, branchId);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Sales hourly summary retrieved successfully');
		} catch (error) {
			console.error('Error fetching sales hourly summary:', error);
			return ApiResponse.error(res, 'Failed to fetch sales hourly summary', 500, error.message);
		}
	}

	// Import sales hourly summary (POST)
	static async importSalesHourlySummary(req, res) {
		try {
			const { data } = req.body;
			const branchId = req.session?.branch_id || req.body.branch_id || req.query.branch_id || req.user?.branch_id || null;

			if (!Array.isArray(data) || data.length === 0) {
				return ApiResponse.badRequest(res, 'No data to import. Expected array of { sale_datetime, total_sales, refund, discount, net_sales, product_unit_price, gross_profit }');
			}
			const result = await ReportsModel.importSalesHourlySummary(data, branchId);
			return ApiResponse.success(res, result, `Successfully imported ${result.inserted} hourly sales record(s)`);
		} catch (error) {
			console.error('Error importing sales hourly summary:', error);
			return ApiResponse.error(res, 'Failed to import sales hourly summary', 500, error.message);
		}
	}

	// Get receipts (Receipt Storage Box modal)
	static async getReceipts(req, res) {
		try {
			const { start_date, end_date, employee_filter, search } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getReceipts(start_date, end_date, branchId, employee_filter || null, search || null);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Receipts retrieved successfully');
		} catch (error) {
			console.error('Error fetching receipts:', error);
			return ApiResponse.error(res, 'Failed to fetch receipts', 500, error.message);
		}
	}

	// Import receipts (POST)
	static async importReceipts(req, res) {
		try {
			const { data } = req.body;

			if (!Array.isArray(data) || data.length === 0) {
				return ApiResponse.badRequest(res, 'No data to import. Expected array of { receipt_number, receipt_date, employee_name, customer_name, transaction_type, total_amount }');
			}
			const result = await ReportsModel.importReceipts(data);
			const msg = result.skipped ? `Imported ${result.inserted} receipt(s). Skipped ${result.skipped} duplicate(s).` : `Successfully imported ${result.inserted} receipt(s)`;
			return ApiResponse.success(res, result, msg);
		} catch (error) {
			console.error('Error importing receipts:', error);
			return ApiResponse.error(res, 'Failed to import receipts', 500, error.message);
		}
	}

	// Get discount report (from discount_report table)
	static async getDiscountReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getDiscountReport(start_date, end_date, branchId);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Discount report retrieved successfully');
		} catch (error) {
			console.error('Error fetching discount report:', error);
			return ApiResponse.error(res, 'Failed to fetch discount report', 500, error.message);
		}
	}

	// Import discount data (POST - insert into discount_report table)
	static async importDiscountReport(req, res) {
		try {
			const { data } = req.body;
			if (!Array.isArray(data) || data.length === 0) {
				return ApiResponse.badRequest(res, 'No data to import. Expected array of { name, discount_applied, point_discount_amount }');
			}
			const result = await ReportsModel.importDiscountReport(data);
			return ApiResponse.success(res, result, `Successfully imported ${result.inserted} discount record(s)`);
		} catch (error) {
			console.error('Error importing discount report:', error);
			return ApiResponse.error(res, 'Failed to import discount report', 500, error.message);
		}
	}

	// Get sales by category report (from sales_category_report table)
	static async getSalesCategoryReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getSalesCategoryReport(start_date, end_date, branchId);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Sales by category report retrieved successfully');
		} catch (error) {
			console.error('Error fetching sales by category report:', error);
			return ApiResponse.error(res, 'Failed to fetch sales by category report', 500, error.message);
		}
	}

	// Import sales category data (POST - insert into sales_category_report table)
	static async importSalesCategoryReport(req, res) {
		try {
			const { data } = req.body;
			if (!Array.isArray(data) || data.length === 0) {
				return ApiResponse.badRequest(res, 'No data to import. Expected array of { category, sales_quantity, net_sales, unit_cost, total_revenue }');
			}
			const result = await ReportsModel.importSalesCategoryReport(data);
			return ApiResponse.success(res, result, `Successfully imported ${result.inserted} sales category record(s)`);
		} catch (error) {
			console.error('Error importing sales category report:', error);
			return ApiResponse.error(res, 'Failed to import sales category report', 500, error.message);
		}
	}

	// Get goods sales report (from goods_sales_report table)
	static async getGoodsSalesReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getGoodsSalesReport(start_date, end_date, branchId);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				data: report
			}, 'Goods sales report retrieved successfully');
		} catch (error) {
			console.error('Error fetching goods sales report:', error);
			return ApiResponse.error(res, 'Failed to fetch goods sales report', 500, error.message);
		}
	}

	// Import goods sales data (POST - insert into goods_sales_report table)
	static async importGoodsSalesReport(req, res) {
		try {
			const { data } = req.body;
			
			if (!Array.isArray(data) || data.length === 0) {
				return ApiResponse.badRequest(res, 'No data to import. Expected array of { goods, category, sales_quantity, discounts, net_sales, unit_cost, total_revenue }');
			}
			
			const result = await ReportsModel.importGoodsSalesReport(data);
			return ApiResponse.success(res, result, `Successfully imported ${result.inserted} goods sales record(s)`);
		} catch (error) {
			console.error('Error importing goods sales report:', error);
			return ApiResponse.error(res, 'Failed to import goods sales report', 500, error.message);
		}
	}

	// Validate imported data - check if totals tally across different tables
	static async validateImportedData(req, res) {
		try {
			const { branch_id, start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || branch_id || req.user?.branch_id || null;

			const validation = await ReportsModel.validateImportedData(branchId, start_date || null, end_date || null);

			return ApiResponse.success(res, validation, 'Data validation completed');
		} catch (error) {
			console.error('Error validating imported data:', error);
			return ApiResponse.error(res, 'Failed to validate imported data', 500, error.message);
		}
	}
}

module.exports = ReportsController;


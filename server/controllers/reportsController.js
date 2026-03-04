// ============================================
// REPORTS CONTROLLER
// ============================================
// File: controllers/reportsController.js
// Description: Handles reports and analytics business logic
// ============================================

const ReportsModel = require('../models/reportsModel');
const ApiResponse = require('../utils/apiResponse');

// Python analytics service (PyServer) base URL - internal only
const PYSERVER_BASE_URL = process.env.PYSERVER_BASE_URL || 'http://localhost:2100';
// node-fetch v3 is ESM-only; use dynamic import bridge for CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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

	// Get total sales per branch
	static async getSalesPerBranch(req, res) {
		try {
			const { start_date, end_date, branch_id } = req.query;

			const report = await ReportsModel.getSalesPerBranch(start_date || null, end_date || null, branch_id || null);

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branch_id || null,
				data: report
			}, 'Sales per branch retrieved successfully');
		} catch (error) {
			console.error('Error fetching sales per branch:', error);
			return ApiResponse.error(res, 'Failed to fetch sales per branch', 500, error.message);
		}
	}

	// Get least selling / zero-sales menu items
	static async getLeastSellingItems(req, res) {
		try {
			const { start_date, end_date, limit = 5 } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const report = await ReportsModel.getLeastSellingItems(start_date || null, end_date || null, branchId, parseInt(limit));

			return ApiResponse.success(res, {
				start_date: start_date || null,
				end_date: end_date || null,
				branch_id: branchId,
				limit: parseInt(limit),
				data: report
			}, 'Least selling items retrieved successfully');
		} catch (error) {
			console.error('Error fetching least selling items:', error);
			return ApiResponse.error(res, 'Failed to fetch least selling items', 500, error.message);
		}
	}

	// ============================================
	// PYTHON ANALYTICS (PyServer) PROXY ENDPOINTS
	// ============================================

	// Daily sales time series (proxied to PyServer)
	static async getAnalyticsDailySales(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/daily-sales', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] daily-sales HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] daily-sales JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] daily-sales error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const series = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: series
				},
				'Daily sales analytics retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics daily sales from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics daily sales', 500, error.message);
		}
	}

	// Branch-level sales (proxied to PyServer)
	static async getAnalyticsBranchSales(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/branch-sales', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] branch-sales HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] branch-sales JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] branch-sales error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: rows
				},
				'Branch sales analytics retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics branch sales from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics branch sales', 500, error.message);
		}
	}

	// Expense summary (proxied to PyServer)
	static async getAnalyticsExpenseSummary(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/expense-summary', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] expense-summary HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] expense-summary JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] expense-summary error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const summary = json?.data || { total_expense: 0 };

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: summary
				},
				'Expense summary retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics expense summary from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics expense summary', 500, error.message);
		}
	}

	// Menu-level sales report (proxied to PyServer)
	static async getAnalyticsMenuReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/menu-report', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] menu-report HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] menu-report JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] menu-report error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: rows
				},
				'Menu report retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics menu report from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics menu report', 500, error.message);
		}
	}

	// Category-level sales report (proxied to PyServer)
	static async getAnalyticsCategoryReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/category-report', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] category-report HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] category-report JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] category-report error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: rows
				},
				'Category report retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics category report from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics category report', 500, error.message);
		}
	}

	// Payment method breakdown report (proxied to PyServer)
	static async getAnalyticsPaymentReport(req, res) {
		try {
			const { start_date, end_date } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/payment-report', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] payment-report HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] payment-report JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] payment-report error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					data: rows
				},
				'Payment report retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics payment report from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics payment report', 500, error.message);
		}
	}

	// Top-selling menu items (proxied to PyServer)
	static async getAnalyticsTopSelling(req, res) {
		try {
			const { start_date, end_date, limit = 5 } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/top-selling', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));
			if (limit) url.searchParams.set('limit', String(limit));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] top-selling HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] top-selling JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] top-selling error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					limit: parseInt(limit, 10) || 5,
					data: rows
				},
				'Top-selling items retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics top-selling items from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics top-selling items', 500, error.message);
		}
	}

	// Least-selling / zero-sales menu items (proxied to PyServer)
	static async getAnalyticsLeastSelling(req, res) {
		try {
			const { start_date, end_date, limit = 5 } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/least-selling', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));
			if (limit) url.searchParams.set('limit', String(limit));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] least-selling HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] least-selling JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] least-selling error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					limit: parseInt(limit, 10) || 5,
					data: rows
				},
				'Least-selling items retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics least-selling items from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics least-selling items', 500, error.message);
		}
	}

	// Receipt-level report (proxied to PyServer)
	static async getAnalyticsReceiptReport(req, res) {
		try {
			const { start_date, end_date, type } = req.query;
			const branchId = req.session?.branch_id || req.query.branch_id || req.user?.branch_id || null;

			const url = new URL('/api/analytics/receipt-report', PYSERVER_BASE_URL);
			if (start_date) url.searchParams.set('start_date', start_date);
			if (end_date) url.searchParams.set('end_date', end_date);
			if (branchId) url.searchParams.set('branch_id', String(branchId));
			if (type) url.searchParams.set('type', String(type));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] receipt-report HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] receipt-report JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] receipt-report error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const rows = json?.data?.data || [];

			return ApiResponse.success(
				res,
				{
					start_date: start_date || null,
					end_date: end_date || null,
					branch_id: branchId,
					type: type || null,
					data: rows
				},
				'Receipt report retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics receipt report from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics receipt report', 500, error.message);
		}
	}

	// Single receipt detail (proxied to PyServer)
	static async getAnalyticsReceiptDetail(req, res) {
		try {
			const { order_id } = req.query;
			if (!order_id) {
				return ApiResponse.badRequest(res, 'order_id is required');
			}

			const url = new URL('/api/analytics/receipt-detail', PYSERVER_BASE_URL);
			url.searchParams.set('order_id', String(order_id));

			const pyRes = await fetch(url.toString());
			if (!pyRes.ok) {
				const text = await pyRes.text().catch(() => '');
				console.error('[PyServer] receipt-detail HTTP error:', pyRes.status, text);
				return ApiResponse.error(
					res,
					`Python analytics service error (status ${pyRes.status})`,
					502,
					text || `PyServer responded with status ${pyRes.status}`
				);
			}

			const json = await pyRes.json().catch((err) => {
				console.error('[PyServer] receipt-detail JSON parse error:', err);
				return null;
			});

			if (!json || json.success === false) {
				const msg = json?.message || 'Unknown error from Python analytics service';
				console.error('[PyServer] receipt-detail error payload:', json);
				return ApiResponse.error(res, msg, 502, json?.error || msg);
			}

			const detail = json?.data || null;

			return ApiResponse.success(
				res,
				{
					order_id,
					data: detail
				},
				'Receipt detail retrieved from Python service'
			);
		} catch (error) {
			console.error('Error fetching analytics receipt detail from PyServer:', error);
			return ApiResponse.error(res, 'Failed to fetch analytics receipt detail', 500, error.message);
		}
	}
}

module.exports = ReportsController;

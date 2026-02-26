// ============================================
// REPORTS ROUTES
// ============================================
// File: routes/reportsRoutes.js
// Description: Routes for reports and analytics endpoints
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/unifiedAuth');
const ReportsController = require('../controllers/reportsController');

// ============================================
// GET ROUTES
// ============================================

// GET - Revenue report
// Query: ?period=daily|weekly|monthly&start_date=...&end_date=...&branch_id=...
router.get("/reports/revenue", authenticate, ReportsController.getRevenueReport);

// GET - Order report
// Query: ?start_date=...&end_date=...&branch_id=...&status=...
router.get("/reports/orders", authenticate, ReportsController.getOrderReport);

// GET - Popular menu items
// Query: ?start_date=...&end_date=...&branch_id=...&limit=10
router.get("/reports/menu-items", authenticate, ReportsController.getPopularMenuItems);

// GET - Daily sales by product (for chart)
// Query: ?start_date=...&end_date=...&branch_id=...&limit=5
router.get("/reports/daily-sales-by-product", authenticate, ReportsController.getDailySalesByProduct);

// GET - Table utilization report
// Query: ?start_date=...&end_date=...&branch_id=...
router.get("/reports/tables", authenticate, ReportsController.getTableUtilizationReport);

// GET - Employee performance report
// Query: ?start_date=...&end_date=...&branch_id=...&employee_id=...
router.get("/reports/employees", authenticate, ReportsController.getEmployeePerformanceReport);

// GET - Sales hourly summary (Total Sales Detail modal)
// Query: ?start_date=...&end_date=...&branch_id=...
router.get("/reports/sales-hourly-summary", authenticate, ReportsController.getSalesHourlySummary);

// POST - Import sales hourly summary into sales_hourly_summary table
// Body: { data: [...], branch_id?: string }
router.post("/reports/sales-hourly-summary/import", authenticate, ReportsController.importSalesHourlySummary);

// GET - Receipts (Receipt Storage Box modal)
// Query: ?start_date=...&end_date=...&employee_filter=...&search=...
router.get("/reports/receipts", authenticate, ReportsController.getReceipts);

// POST - Import receipts into receipts table
// Body: { data: [{ receipt_number, receipt_date, employee_name, customer_name, transaction_type, total_amount }, ...] }
router.post("/reports/receipts/import", authenticate, ReportsController.importReceipts);

// GET - Discount report (from discount_report table)
// Query: ?start_date=...&end_date=...&branch_id=...
router.get("/reports/discount", authenticate, ReportsController.getDiscountReport);

// POST - Import discount data into discount_report table
// Body: { data: [{ name, discount_applied, point_discount_amount }, ...] }
router.post("/reports/discount/import", authenticate, ReportsController.importDiscountReport);

// GET - Sales by category report (from sales_category_report table)
// Query: ?start_date=...&end_date=...&branch_id=...
router.get("/reports/sales-category", authenticate, ReportsController.getSalesCategoryReport);

// POST - Import sales category data into sales_category_report table
// Body: { data: [{ category, sales_quantity, net_sales, unit_cost, total_revenue }, ...] }
router.post("/reports/sales-category/import", authenticate, ReportsController.importSalesCategoryReport);

// GET - Goods sales report (from goods_sales_report table)
// Query: ?start_date=...&end_date=...&branch_id=...
router.get("/reports/goods-sales", authenticate, ReportsController.getGoodsSalesReport);

// POST - Import goods sales data into goods_sales_report table
// Body: { data: [{ goods, category, sales_quantity, discounts, net_sales, unit_cost, total_revenue }, ...] }
router.post("/reports/goods-sales/import", authenticate, ReportsController.importGoodsSalesReport);

// GET - Sales per branch (total sales aggregated by branch)
// Query: ?start_date=...&end_date=...
router.get("/reports/sales-per-branch", authenticate, ReportsController.getSalesPerBranch);

// GET - Least selling / zero-sales items
// Query: ?start_date=...&end_date=...&branch_id=...&limit=5
router.get("/reports/least-selling-items", authenticate, ReportsController.getLeastSellingItems);

// GET - Validate imported data (check if totals tally across tables)
// Query: ?branch_id=...&start_date=...&end_date=...
router.get("/reports/validate-imported-data", authenticate, ReportsController.validateImportedData);

// ============================================
// EXPORT
// ============================================

module.exports = router;


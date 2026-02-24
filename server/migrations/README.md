# Database Migrations

## add_sale_datetime_to_sales_category_report.sql

**Purpose:** Add `branch_id`, `sale_datetime`, and `created_at` columns to `sales_category_report` — same structure as Total Sales (`sales_hourly_summary`) for date picker filtering.

**When to run:** Run BEFORE using the updated Sales by Category feature with date filtering.

**How to run:** Execute the SQL in phpMyAdmin or MySQL client.

-- Migration: Add sale_datetime, branch_id, created_at to sales_category_report
-- Same structure as Total Sales (sales_hourly_summary) for date picker filtering
-- Run this in phpMyAdmin or MySQL client BEFORE using the updated backend

-- Step 1: Add new columns (with defaults for existing rows)
ALTER TABLE `sales_category_report`
  ADD COLUMN `branch_id` INT(11) NOT NULL DEFAULT 0 AFTER `id`,
  ADD COLUMN `sale_datetime` DATETIME NOT NULL DEFAULT '2026-01-01 00:00:00' AFTER `branch_id`,
  ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `net_sales`;

-- Step 2: Backfill branch_id for existing rows (use branch from sales_hourly_summary/Total Sales, or 1 as fallback)
UPDATE `sales_category_report` scr
SET scr.`branch_id` = COALESCE(
  (SELECT branch_id FROM sales_hourly_summary LIMIT 1),
  (SELECT BRANCH_ID FROM orders LIMIT 1),
  1
)
WHERE scr.`branch_id` = 0;

-- Step 3: Backfill sale_datetime - set to today so legacy data appears in "today" view
UPDATE `sales_category_report` SET `sale_datetime` = CONCAT(CURDATE(), ' 00:00:00') WHERE `sale_datetime` = '2026-01-01 00:00:00';

-- Step 4: Add index for fast date filtering
ALTER TABLE `sales_category_report` ADD INDEX `idx_sale_datetime_branch` (`sale_datetime`, `branch_id`);

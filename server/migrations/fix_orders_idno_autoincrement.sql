-- Migration: Ensure IDNo has AUTO_INCREMENT for Loyverse sync
-- Error: "Field 'IDNo' doesn't have a default value" when syncing receipts
-- Run this in MySQL (phpMyAdmin or CLI) then restart the node server.

-- Fix orders table (main fix for Loyverse receipt sync)
ALTER TABLE `orders` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;

-- Fix related tables used by Loyverse sync
ALTER TABLE `billing` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `order_items` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;

-- Fix expenses table (ExpenseController.create)
ALTER TABLE `expenses` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;

-- Fix master_categories (inventory categories API)
ALTER TABLE `master_categories` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;

-- Optional: if menu auto-create fails with same error
-- ALTER TABLE `menu` MODIFY COLUMN `IDNo` INT NOT NULL AUTO_INCREMENT;

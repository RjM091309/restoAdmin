-- Migration: Create goods_sales_report table
-- Used when billing is paid (sync) and for Sales by Product import
-- Run this in phpMyAdmin or MySQL client to fix: Table 'restaurant.goods_sales_report' doesn't exist

CREATE TABLE IF NOT EXISTS `goods_sales_report` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `goods` VARCHAR(255) NOT NULL,
  `category` VARCHAR(255) NOT NULL DEFAULT 'Uncategorized',
  `sales_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discounts` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `net_sales` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_goods` (`goods`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

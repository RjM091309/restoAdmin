-- Copy categories, menu items and tables from branch 4 (3Core test branch)
-- into branch 14 (Resto Demo, DEMO01).
--
-- BACK UP THE DATABASE FIRST (at least categories, menu, restaurant_tables).
-- Run the sections in order, in one session (phpMyAdmin SQL tab / mysql client).
-- Needs MySQL 8+ (ROW_NUMBER()).
--
-- Copies: categories (keeps the parent/child tree), menu, restaurant_tables.
-- Does NOT copy: orders, billing, users, inventory/ingredients, FLOOR values.
-- Menu image paths (MENU_IMG) are shared with branch 4 — same files, not duplicates.

SET @src := 4;
SET @dst := 14;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) PRE-CHECK — run this alone first. Expect dst_* = 0.
--    If branch 14 already has categories/menu/tables (e.g. you added some by
--    hand), delete them or edit this script before continuing, otherwise you
--    will get duplicates.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM categories        WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_categories,
  (SELECT COUNT(*) FROM menu              WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_menu,
  (SELECT COUNT(*) FROM restaurant_tables WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_tables,
  (SELECT COUNT(*) FROM categories        WHERE BRANCH_ID = @dst)                AS dst_categories,
  (SELECT COUNT(*) FROM menu              WHERE BRANCH_ID = @dst)                AS dst_menu,
  (SELECT COUNT(*) FROM restaurant_tables WHERE BRANCH_ID = @dst)                AS dst_tables;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) COPY — run this block together (same session as the SET lines above).
-- ─────────────────────────────────────────────────────────────────────────────
-- Old category id -> new category id. A normal (not TEMPORARY) table, because
-- MySQL can't join a TEMPORARY table to itself in one query.
DROP TABLE IF EXISTS tmp_demo_cat_map;
CREATE TABLE tmp_demo_cat_map (
  old_id INT NOT NULL PRIMARY KEY,
  new_id INT NOT NULL
);

-- DDL (CREATE/DROP TABLE) commits implicitly in MySQL, so the map table is created
-- before, and dropped after, the transaction.
START TRANSACTION;

-- categories.IDNo may not be AUTO_INCREMENT (the app itself uses MAX+1), so
-- hand out ids explicitly, starting after the current maximum.
SET @base := (SELECT COALESCE(MAX(IDNo), 0) FROM categories);

INSERT INTO tmp_demo_cat_map (old_id, new_id)
SELECT IDNo, @base + ROW_NUMBER() OVER (ORDER BY IDNo)
FROM categories
WHERE BRANCH_ID = @src AND ACTIVE = 1;

-- A category whose parent is inactive/missing becomes a top-level category.
INSERT INTO categories
  (IDNo, BRANCH_ID, CAT_NAME, CAT_DESC, ACTIVE, ENCODED_BY, ENCODED_DT, PARENT_CAT_ID)
SELECT m.new_id, @dst, c.CAT_NAME, c.CAT_DESC, 1, NULL, NOW(), pm.new_id
FROM categories c
JOIN tmp_demo_cat_map m  ON m.old_id  = c.IDNo
LEFT JOIN tmp_demo_cat_map pm ON pm.old_id = c.PARENT_CAT_ID
WHERE c.BRANCH_ID = @src AND c.ACTIVE = 1;

-- menu.IDNo is AUTO_INCREMENT (the app relies on insertId). Items whose
-- category was not copied (inactive/NULL) are skipped by the inner join.
INSERT INTO menu
  (BRANCH_ID, CATEGORY_ID, MENU_NAME, MENU_DESCRIPTION, MENU_IMG, MENU_PRICE,
   IS_AVAILABLE, ACTIVE, ENCODED_BY, ENCODED_DT)
SELECT @dst, m.new_id, me.MENU_NAME, me.MENU_DESCRIPTION, me.MENU_IMG, me.MENU_PRICE,
       me.IS_AVAILABLE, 1, NULL, NOW()
FROM menu me
JOIN tmp_demo_cat_map m ON m.old_id = me.CATEGORY_ID
WHERE me.BRANCH_ID = @src AND me.ACTIVE = 1;

-- Tables: always start AVAILABLE; FLOOR is left NULL on purpose (the demo
-- branch is not floor-scoped). ENCODED_BY is NOT NULL on this table.
INSERT INTO restaurant_tables
  (BRANCH_ID, TABLE_NUMBER, CAPACITY, ROOM_CHARGE, STATUS, ACTIVE, ENCODED_BY, ENCODED_DT)
SELECT @dst, TABLE_NUMBER, CAPACITY, ROOM_CHARGE, 1, 1, 'demo', NOW()
FROM restaurant_tables
WHERE BRANCH_ID = @src AND ACTIVE = 1;

SELECT
  (SELECT COUNT(*) FROM categories        WHERE BRANCH_ID = @dst) AS dst_categories,
  (SELECT COUNT(*) FROM menu              WHERE BRANCH_ID = @dst) AS dst_menu,
  (SELECT COUNT(*) FROM restaurant_tables WHERE BRANCH_ID = @dst) AS dst_tables;

-- phpMyAdmin (or any tool where each "Go" may be a new connection): the open
-- transaction and the @variables would be lost between runs, so commit in the
-- same run. If the counts look wrong afterwards, use the reset DELETEs in
-- section 3 (fine while branch 14 has no real demo orders yet).
-- mysql CLI (one session): you may comment COMMIT out, check the counts above,
-- then type COMMIT; or ROLLBACK; yourself.
COMMIT;

DROP TABLE tmp_demo_cat_map;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) OPTIONAL CHECKS AFTER COMMIT
-- ─────────────────────────────────────────────────────────────────────────────
-- Any menu item pointing at a category that isn't in branch 14? (expect 0 rows)
-- SELECT me.IDNo, me.MENU_NAME FROM menu me
--   LEFT JOIN categories c ON c.IDNo = me.CATEGORY_ID AND c.BRANCH_ID = @dst
--  WHERE me.BRANCH_ID = @dst AND c.IDNo IS NULL;
--
-- Table names: "Room 1".."Room 13" are treated as 2nd Floor by the Flutter app's
-- naming heuristic. If branch 4 uses those names, rename them in Users -> Tables.
-- SELECT TABLE_NUMBER, ROOM_CHARGE FROM restaurant_tables WHERE BRANCH_ID = @dst;
--
-- To reset the demo copy later (only before real demo orders exist, or delete
-- those orders first):
-- DELETE FROM menu              WHERE BRANCH_ID = @dst;
-- DELETE FROM categories        WHERE BRANCH_ID = @dst;
-- DELETE FROM restaurant_tables WHERE BRANCH_ID = @dst;

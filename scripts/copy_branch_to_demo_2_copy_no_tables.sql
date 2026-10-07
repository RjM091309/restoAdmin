-- STEP 2 (NO TABLES): copies categories + menu only; branch 14's existing tables are left alone.
-- Only after STEP 1 looked right. Paste the whole file and run it once (it commits at the end).
SET @src := 4;
SET @dst := 14;

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

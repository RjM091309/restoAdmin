-- STEP 1: run alone. Expect dst_categories / dst_menu / dst_tables = 0 and src_menu > 0.
SET @src := 4;
SET @dst := 14;

SELECT
  (SELECT COUNT(*) FROM categories        WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_categories,
  (SELECT COUNT(*) FROM menu              WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_menu,
  (SELECT COUNT(*) FROM restaurant_tables WHERE BRANCH_ID = @src AND ACTIVE = 1) AS src_tables,
  (SELECT COUNT(*) FROM categories        WHERE BRANCH_ID = @dst)                AS dst_categories,
  (SELECT COUNT(*) FROM menu              WHERE BRANCH_ID = @dst)                AS dst_menu,
  (SELECT COUNT(*) FROM restaurant_tables WHERE BRANCH_ID = @dst)                AS dst_tables;

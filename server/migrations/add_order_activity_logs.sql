-- Activity log of the waiter / cashier tablets: one row per thing done to an
-- order (new order, items added / edited, room charge, transfer, confirm,
-- cancel, settle), shown in the cashier app's Activity tab. SYNCED_LATE = 1
-- when the tablet did it offline and the row was written once it synced
-- (CREATED_DT is then the tablet's original time). See OrderActivityLogModel.
--
-- You normally don't need to run this by hand: the server creates the table on
-- boot (utils/ensureSchema.js -> ensureOrderActivityLogsTable). It is kept here
-- so the schema change is on record and can be applied manually if the DB user
-- lacks CREATE privileges.

CREATE TABLE IF NOT EXISTS order_activity_logs (
	IDNo INT NOT NULL AUTO_INCREMENT,
	BRANCH_ID INT NULL,
	ORDER_ID INT NULL,
	ORDER_NO VARCHAR(64) NULL,
	TABLE_NUMBER VARCHAR(100) NULL,
	FLOOR VARCHAR(10) NULL,
	ACTION VARCHAR(32) NOT NULL,
	SUMMARY VARCHAR(255) NOT NULL,
	DETAILS TEXT NULL,
	AMOUNT DECIMAL(12,2) NULL,
	USER_ID INT NULL,
	USERNAME VARCHAR(100) NULL,
	USER_FULLNAME VARCHAR(150) NULL,
	USER_ROLE VARCHAR(50) NULL,
	SYNCED_LATE TINYINT(1) NOT NULL DEFAULT 0,
	CREATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (IDNo),
	KEY idx_oal_branch_dt (BRANCH_ID, CREATED_DT),
	KEY idx_oal_order (ORDER_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

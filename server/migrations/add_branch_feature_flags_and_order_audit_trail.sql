-- Per-branch action sub-toggles (Control Panel → Branches, under "Orders") and
-- the 3coredev-only order audit trail (User Management → Audit Trail).
--
-- You normally don't need to run this by hand: the server creates both tables
-- on first use (models/branchFeatureFlagModel.js, models/orderAuditTrailModel.js).
-- Kept here so the schema change is on record and can be applied manually if
-- the DB user lacks CREATE privileges.

CREATE TABLE IF NOT EXISTS branch_feature_flags (
	branch_id INT NOT NULL,
	flag_key VARCHAR(64) NOT NULL,          -- orders_update_encoded_dt | orders_soft_delete
	enabled TINYINT(1) NOT NULL DEFAULT 0,  -- no row = OFF; administrators ignore these flags
	updated_dt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (branch_id, flag_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Blue Moon (IDNo 3) keeps what its "bmoon" account could already do.
INSERT IGNORE INTO branch_feature_flags (branch_id, flag_key, enabled)
SELECT 3, 'orders_update_encoded_dt', 1 FROM branches WHERE IDNo = 3;
INSERT IGNORE INTO branch_feature_flags (branch_id, flag_key, enabled)
SELECT 3, 'orders_soft_delete', 1 FROM branches WHERE IDNo = 3;

CREATE TABLE IF NOT EXISTS order_audit_trail (
	IDNo INT NOT NULL AUTO_INCREMENT,
	BRANCH_ID INT NULL,
	ORDER_ID INT NULL,
	ORDER_NO VARCHAR(64) NULL,
	ACTION VARCHAR(32) NOT NULL,            -- encoded_dt_updated | soft_deleted
	SUMMARY VARCHAR(255) NOT NULL,
	DETAILS TEXT NULL,                      -- JSON: from/to encoded date, previous status, total...
	AMOUNT DECIMAL(12,2) NULL,              -- order grand total at the time
	USER_ID INT NULL,
	USERNAME VARCHAR(100) NULL,
	USER_ROLE VARCHAR(50) NULL,
	IS_ADMIN TINYINT(1) NOT NULL DEFAULT 0,
	CREATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (IDNo),
	KEY idx_oat_dt (CREATED_DT),
	KEY idx_oat_branch_dt (BRANCH_ID, CREATED_DT),
	KEY idx_oat_order (ORDER_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

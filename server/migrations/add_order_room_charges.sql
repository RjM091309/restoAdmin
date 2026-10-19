-- Room-charge history per order: one row per room (restaurant_tables with a
-- ROOM_CHARGE) the order used, with the rate, the hours billed there and the
-- amount. The open row (ENDED_AT NULL) is the room the order is in now; moving
-- the order to another room closes it and opens a new one (see
-- OrderRoomChargeModel and ApiController.transferTableOrder).
--
-- You normally don't need to run this by hand: the server creates the table on
-- boot (utils/ensureSchema.js -> ensureOrderRoomChargesTable). It is kept here so
-- the schema change is on record and can be applied manually if the DB user
-- lacks CREATE privileges.

CREATE TABLE IF NOT EXISTS order_room_charges (
	IDNo INT NOT NULL AUTO_INCREMENT,
	ORDER_ID INT NOT NULL,
	BRANCH_ID INT NULL,
	TABLE_ID INT NULL,
	TABLE_NUMBER VARCHAR(100) NULL,
	RATE DECIMAL(12,2) NOT NULL DEFAULT 0,
	HOURS DECIMAL(6,2) NOT NULL DEFAULT 0,
	AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
	STARTED_AT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	ENDED_AT DATETIME NULL DEFAULT NULL,
	ENCODED_BY INT NULL,
	ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	EDITED_BY INT NULL,
	EDITED_DT DATETIME NULL DEFAULT NULL,
	PRIMARY KEY (IDNo),
	KEY idx_orc_order (ORDER_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

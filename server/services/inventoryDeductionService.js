class InventoryDeductionService {
	static async settleOrderWithInventory(orderId, userId) {
		// Inventory deduction is intentionally disabled while inventory tables are being redesigned.
		return { deducted: false, reason: 'inventory_deduction_temporarily_disabled', orderId, userId: userId || null };
	}
}

module.exports = InventoryDeductionService;

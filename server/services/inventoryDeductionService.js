// ============================================
// INVENTORY DEDUCTION SERVICE
// ============================================
// Flow: orders -> order_items -> menu_ingredients -> inventory_deductions -> inventory
// Deducts on CONFIRMED (status 2), reverses on CANCELLED (status -1)
// ============================================

const pool = require('../config/db');
const OrderModel = require('../models/orderModel');
const OrderItemsModel = require('../models/orderItemsModel');
const MenuIngredientModel = require('../models/menuIngredientModel');
const InventoryModel = require('../models/inventoryModel');
const InventoryDeductionModel = require('../models/inventoryDeductionModel');

const VALID_UNITS = ['pcs', 'box', 'pack', 'bottle', 'jar', 'can', 'bag', 'head', 'bunch', 'cup', 'kg', 'g', 'l', 'ml'];

function sanitizeUnit(unit) {
	const u = unit && String(unit).trim() ? String(unit).trim().toLowerCase() : 'pcs';
	return VALID_UNITS.includes(u) ? u : 'pcs';
}

async function deductStockWithConn(conn, branchId, ingredientId, qty, userId) {
	const deductQty = Number(qty);
	if (!Number.isFinite(deductQty) || deductQty <= 0) return false;
	const [rows] = await conn.execute(
		`SELECT IDNo, STOCK_QTY FROM inventory WHERE INGREDIENT_ID = ? AND BRANCH_ID = ? AND ACTIVE = 1 LIMIT 1`,
		[Number(ingredientId), Number(branchId)]
	);
	if (!rows.length) return false;
	const current = Number(rows[0].STOCK_QTY) || 0;
	const newQty = Math.max(0, current - deductQty);
	await conn.execute(
		`UPDATE inventory SET STOCK_QTY = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
		[newQty, userId != null ? Number(userId) : null, rows[0].IDNo]
	);
	return true;
}

async function addStockWithConn(conn, branchId, ingredientId, qty, userId) {
	const addQty = Number(qty);
	if (!Number.isFinite(addQty) || addQty <= 0) return false;
	const [rows] = await conn.execute(
		`SELECT IDNo, STOCK_QTY FROM inventory WHERE INGREDIENT_ID = ? AND BRANCH_ID = ? AND ACTIVE = 1 LIMIT 1`,
		[Number(ingredientId), Number(branchId)]
	);
	if (!rows.length) {
		await conn.execute(
			`INSERT INTO inventory (BRANCH_ID, INGREDIENT_ID, STOCK_QTY, STATUS_FLAG, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, 'In Stock', 1, ?, NOW())`,
			[Number(branchId), Number(ingredientId), addQty, userId != null ? Number(userId) : null]
		);
		return true;
	}
	const current = Number(rows[0].STOCK_QTY) || 0;
	await conn.execute(
		`UPDATE inventory SET STOCK_QTY = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
		[current + addQty, userId != null ? Number(userId) : null, rows[0].IDNo]
	);
	return true;
}

class InventoryDeductionService {
	/**
	 * Deduct menu_ingredients from inventory when order is CONFIRMED.
	 * Records each deduction in inventory_deductions.
	 */
	static async deductOnOrderConfirmed(orderId, userId) {
		const order = await OrderModel.getById(orderId);
		if (!order || !order.BRANCH_ID) {
			return { deducted: false, reason: 'order_not_found_or_no_branch', count: 0 };
		}
		if (await InventoryDeductionModel.hasActiveDeductionsForOrder(orderId)) {
			return { deducted: false, reason: 'already_deducted', count: 0 };
		}
		const branchId = Number(order.BRANCH_ID);
		const orderItems = await OrderItemsModel.getByOrderId(orderId);
		if (!orderItems.length) {
			return { deducted: false, reason: 'no_order_items', count: 0 };
		}

		let totalDeducted = 0;
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			for (const item of orderItems) {
				const menuId = item.MENU_ID;
				const itemQty = Number(item.QTY) || 1;
				const menuIngredients = await MenuIngredientModel.getByMenuId(menuId);
				for (const mi of menuIngredients) {
					const deductedQty = (Number(mi.QTY_PER_SERVE) || 1) * itemQty;
					const unit = sanitizeUnit(mi.UNIT);
					const ingredientId = mi.INGREDIENT_ID;
					const deducted = await deductStockWithConn(connection, branchId, ingredientId, deductedQty, userId);
					if (deducted) {
						await connection.execute(
							`INSERT INTO inventory_deductions (
								ORDER_ID, ORDER_ITEM_ID, BRANCH_ID, INGREDIENT_ID, MENU_ID,
								DEDUCTED_QTY, UNIT, STATUS, ACTIVE, ENCODED_BY, ENCODED_DT
							) VALUES (?, ?, ?, ?, ?, ?, ?, 2, 1, ?, NOW())`,
							[
								orderId,
								item.IDNo,
								branchId,
								ingredientId,
								menuId,
								deductedQty,
								unit,
								userId != null ? Number(userId) : null,
							]
						);
						totalDeducted++;
					}
				}
			}
			await connection.commit();
		} catch (err) {
			await connection.rollback();
			throw err;
		} finally {
			connection.release();
		}
		return { deducted: totalDeducted > 0, count: totalDeducted };
	}

	/**
	 * Reverse deductions when order is CANCELLED. Adds stock back and marks deductions inactive.
	 */
	static async reverseOnOrderCancelled(orderId, userId) {
		const hasActive = await InventoryDeductionModel.hasActiveDeductionsForOrder(orderId);
		if (!hasActive) {
			return { reversed: false, reason: 'no_active_deductions', count: 0 };
		}
		const deductions = await InventoryDeductionModel.getByOrderId(orderId, true);
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			for (const d of deductions) {
				await addStockWithConn(connection, d.BRANCH_ID, d.INGREDIENT_ID, d.DEDUCTED_QTY, userId);
			}
			await connection.execute(
				`UPDATE inventory_deductions SET STATUS = -1, ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE ORDER_ID = ? AND ACTIVE = 1`,
				[userId != null ? Number(userId) : null, Number(orderId)]
			);
			await connection.commit();
		} catch (err) {
			await connection.rollback();
			throw err;
		} finally {
			connection.release();
		}
		return { reversed: true, count: deductions.length };
	}

	/**
	 * Legacy: settle order. Now we deduct on CONFIRMED, so settle just updates order status.
	 * Kept for backward compatibility.
	 */
	static async settleOrderWithInventory(orderId, userId) {
		// Deduction happens on CONFIRMED; settle has no inventory action
		return { deducted: false, reason: 'deduction_on_confirm', orderId, userId: userId || null };
	}
}

module.exports = InventoryDeductionService;

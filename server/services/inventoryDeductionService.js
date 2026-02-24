const pool = require('../config/db');
const InventoryModel = require('../models/inventoryModel');

const STATUS_SETTLED = 1;
const STATUS_ACTIVE = 'Active';

function buildRequirementKey(resourceType, resourceId) {
	return `${resourceType}:${resourceId}`;
}

class InventoryDeductionService {
	static async settleOrderWithInventory(orderId, userId) {
		await InventoryModel.ensureSchema();
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();

			const [orderRows] = await connection.execute(
				`SELECT IDNo, STATUS, BRANCH_ID FROM orders WHERE IDNo = ? FOR UPDATE`,
				[orderId]
			);
			if (orderRows.length === 0) {
				throw new Error('Order not found');
			}
			const order = orderRows[0];

			const [existingDeduction] = await connection.execute(
				`SELECT IDNo FROM order_inventory_deductions WHERE ORDER_ID = ? FOR UPDATE`,
				[orderId]
			);
			if (existingDeduction.length > 0) {
				if (Number(order.STATUS) !== STATUS_SETTLED) {
					await connection.execute(
						`UPDATE orders SET STATUS = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[STATUS_SETTLED, userId || null, orderId]
					);
				}
				await connection.commit();
				return { deducted: false, reason: 'already_deducted' };
			}

			const [orderItems] = await connection.execute(
				`SELECT IDNo, MENU_ID, QTY FROM order_items WHERE ORDER_ID = ?`,
				[orderId]
			);
			if (orderItems.length === 0) {
				throw new Error('Order has no items to deduct');
			}

			const menuIds = [...new Set(orderItems.map((item) => Number(item.MENU_ID)).filter(Boolean))];
			const placeholders = menuIds.map(() => '?').join(',');
			const [mappings] = await connection.execute(
				`
				SELECT IDNo, MENU_ID, PRODUCT_ID, MATERIAL_ID, QUANTITY
				FROM menu_inventory_map
				WHERE ACTIVE = 1 AND MENU_ID IN (${placeholders})
				`,
				menuIds
			);

			const mappingsByMenu = new Map();
			for (const mapping of mappings) {
				if (!mappingsByMenu.has(mapping.MENU_ID)) mappingsByMenu.set(mapping.MENU_ID, []);
				mappingsByMenu.get(mapping.MENU_ID).push(mapping);
			}

			const requirements = new Map();
			for (const item of orderItems) {
				let menuMappings = mappingsByMenu.get(item.MENU_ID) || [];
				if (menuMappings.length === 0) {
					const [menuRows] = await connection.execute(
						`SELECT IDNo, MENU_NAME FROM menu WHERE IDNo = ? LIMIT 1`,
						[item.MENU_ID]
					);
					if (menuRows.length > 0) {
						const [productRows] = await connection.execute(
							`
							SELECT IDNo
							FROM inventory_products
							WHERE ACTIVE = 1
								AND BRANCH_ID = ?
								AND PRODUCT_NAME = ?
							ORDER BY IDNo ASC
							LIMIT 1
							`,
							[order.BRANCH_ID, menuRows[0].MENU_NAME]
						);
						if (productRows.length > 0) {
							await connection.execute(
								`
								INSERT INTO menu_inventory_map
									(MENU_ID, PRODUCT_ID, MATERIAL_ID, QUANTITY, ACTIVE, ENCODED_BY, ENCODED_DT)
								VALUES (?, ?, NULL, 1, 1, ?, CURRENT_TIMESTAMP)
								`,
								[item.MENU_ID, productRows[0].IDNo, userId || null]
							);
							menuMappings = [
								{
									MENU_ID: item.MENU_ID,
									PRODUCT_ID: productRows[0].IDNo,
									MATERIAL_ID: null,
									QUANTITY: 1,
								},
							];
							mappingsByMenu.set(item.MENU_ID, menuMappings);
						}
					}
				}
				if (menuMappings.length === 0) {
					throw new Error(`Missing inventory mapping for menu ID ${item.MENU_ID}`);
				}
				for (const mapRow of menuMappings) {
					const qtyPerMenu = Number(mapRow.QUANTITY || 0);
					if (!Number.isFinite(qtyPerMenu) || qtyPerMenu <= 0) {
						throw new Error(`Invalid inventory mapping quantity for menu ID ${item.MENU_ID}`);
					}
					const orderQty = Number(item.QTY || 0);
					const required = orderQty * qtyPerMenu;
					if (mapRow.PRODUCT_ID) {
						const key = buildRequirementKey('product', Number(mapRow.PRODUCT_ID));
						const prev = requirements.get(key) || {
							resourceType: 'product',
							resourceId: Number(mapRow.PRODUCT_ID),
							requiredQty: 0,
							menus: new Set(),
						};
						prev.requiredQty += required;
						prev.menus.add(Number(item.MENU_ID));
						requirements.set(key, prev);
					} else if (mapRow.MATERIAL_ID) {
						const key = buildRequirementKey('material', Number(mapRow.MATERIAL_ID));
						const prev = requirements.get(key) || {
							resourceType: 'material',
							resourceId: Number(mapRow.MATERIAL_ID),
							requiredQty: 0,
							menus: new Set(),
						};
						prev.requiredQty += required;
						prev.menus.add(Number(item.MENU_ID));
						requirements.set(key, prev);
					} else {
						throw new Error(`Invalid inventory mapping for menu ID ${item.MENU_ID}`);
					}
				}
			}

			for (const requirement of requirements.values()) {
				if (requirement.resourceType === 'product') {
					const [rows] = await connection.execute(
						`SELECT IDNo, STOCK, STATUS, ACTIVE FROM inventory_products WHERE IDNo = ? FOR UPDATE`,
						[requirement.resourceId]
					);
					if (rows.length === 0 || Number(rows[0].ACTIVE) !== 1 || rows[0].STATUS !== STATUS_ACTIVE) {
						throw new Error(`Mapped product #${requirement.resourceId} is inactive or missing`);
					}
					const currentStock = Number(rows[0].STOCK || 0);
					if (currentStock < requirement.requiredQty) {
						throw new Error(`Insufficient product stock for product #${requirement.resourceId}`);
					}
					const nextStock = currentStock - requirement.requiredQty;
					await connection.execute(
						`UPDATE inventory_products SET STOCK = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[nextStock, userId || null, requirement.resourceId]
					);
					requirement.stockBefore = currentStock;
					requirement.stockAfter = nextStock;
				} else {
					const [rows] = await connection.execute(
						`SELECT IDNo, STOCK, STATUS, ACTIVE FROM inventory_materials WHERE IDNo = ? FOR UPDATE`,
						[requirement.resourceId]
					);
					if (rows.length === 0 || Number(rows[0].ACTIVE) !== 1 || rows[0].STATUS !== STATUS_ACTIVE) {
						throw new Error(`Mapped material #${requirement.resourceId} is inactive or missing`);
					}
					const currentStock = Number(rows[0].STOCK || 0);
					if (currentStock < requirement.requiredQty) {
						throw new Error(`Insufficient material stock for material #${requirement.resourceId}`);
					}
					const nextStock = currentStock - requirement.requiredQty;
					await connection.execute(
						`UPDATE inventory_materials SET STOCK = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
						[nextStock, userId || null, requirement.resourceId]
					);
					requirement.stockBefore = currentStock;
					requirement.stockAfter = nextStock;
				}
			}

			for (const requirement of requirements.values()) {
				const menuId = [...requirement.menus][0];
				await connection.execute(
					`
					INSERT INTO inventory_movements
						(ORDER_ID, MENU_ID, RESOURCE_TYPE, RESOURCE_ID, QTY_DEDUCTED, STOCK_BEFORE, STOCK_AFTER, ENCODED_BY)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					`,
					[
						orderId,
						menuId || 0,
						requirement.resourceType,
						requirement.resourceId,
						requirement.requiredQty,
						requirement.stockBefore,
						requirement.stockAfter,
						userId || null,
					]
				);
			}

			await connection.execute(
				`INSERT INTO order_inventory_deductions (ORDER_ID, DEDUCTED_BY) VALUES (?, ?)`,
				[orderId, userId || null]
			);
			await connection.execute(
				`UPDATE orders SET STATUS = ?, EDITED_BY = ?, EDITED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`,
				[STATUS_SETTLED, userId || null, orderId]
			);

			await connection.commit();
			return { deducted: true, count: requirements.size };
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}
}

module.exports = InventoryDeductionService;

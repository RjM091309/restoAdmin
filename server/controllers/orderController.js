// ============================================
// ORDER CONTROLLER
// ============================================
// File: controllers/orderController.js
// Description: Handles order-related pages and APIs
// ============================================

const OrderModel = require('../models/orderModel');
const OrderItemsModel = require('../models/orderItemsModel');
const BillingModel = require('../models/billingModel');
const TableModel = require('../models/tableModel');
const NotificationModel = require('../models/notificationModel');
const InventoryDeductionService = require('../services/inventoryDeductionService');
const socketService = require('../utils/socketService');
const ApiResponse = require('../utils/apiResponse');

class OrderController {

	static async getAll(req, res) {
		try {
			// Prioritize query param so the frontend branch selector works for admin
			const rawBranch = req.query.branch_id ?? req.body.branch_id ?? req.session?.branch_id ?? req.user?.branch_id ?? null;
			// If 'all' is passed, fetch orders for ALL branches (admin view)
			const branchId = (rawBranch === 'all' || rawBranch === '') ? null : rawBranch;
			const orders = await OrderModel.getAll(branchId);
			return ApiResponse.success(res, orders, 'Orders retrieved successfully');
		} catch (error) {
			console.error('Error fetching orders:', error);
			return ApiResponse.error(res, 'Failed to fetch orders', 500, error.message);
		}
	}

	static async getById(req, res) {
		try {
			const { id } = req.params;
			const order = await OrderModel.getById(id);
			if (!order) {
				return ApiResponse.notFound(res, 'Order');
			}
			return ApiResponse.success(res, order, 'Order retrieved successfully');
		} catch (error) {
			console.error('Error fetching order:', error);
			return ApiResponse.error(res, 'Failed to fetch order', 500, error.message);
		}
	}

	static async create(req, res) {
		try {
			// Prioritize session branch_id
			const branchId = req.session?.branch_id || req.body.BRANCH_ID || req.query.branch_id || req.user?.branch_id;
			if (!branchId) {
				return res.status(400).json({ error: 'Branch ID is required. Please select a branch first.' });
			}

			const payload = {
				BRANCH_ID: branchId,
				ORDER_NO: req.body.ORDER_NO,
				TABLE_ID: req.body.TABLE_ID,
				ORDER_TYPE: req.body.ORDER_TYPE,
				STATUS: parseInt(req.body.STATUS) || 3,
				SUBTOTAL: parseFloat(req.body.SUBTOTAL) || 0,
				TAX_AMOUNT: parseFloat(req.body.TAX_AMOUNT) || 0,
				SERVICE_CHARGE: parseFloat(req.body.SERVICE_CHARGE) || 0,
				DISCOUNT_AMOUNT: parseFloat(req.body.DISCOUNT_AMOUNT) || 0,
				GRAND_TOTAL: parseFloat(req.body.GRAND_TOTAL) || 0,
				user_id: req.session.user_id || req.user?.user_id
			};

			const orderId = await OrderModel.create(payload);
			const items = Array.isArray(req.body.ORDER_ITEMS) ? req.body.ORDER_ITEMS : [];
			if (items.length) {
				await OrderItemsModel.createForOrder(orderId, items, req.session.user_id);
			}
			await BillingModel.createForOrder({
				branch_id: payload.BRANCH_ID,
				order_id: orderId,
				amount_due: payload.GRAND_TOTAL,
				amount_paid: 0,
				status: 3,
				user_id: req.session.user_id || req.user?.user_id
			});

			// Update table status to Occupied (2) if a table is assigned
			if (payload.TABLE_ID) {
				await TableModel.updateStatus(payload.TABLE_ID, 2);
			}

			// Get full order data with items for socket emission
			const fullOrder = await OrderModel.getById(orderId);
			const orderItems = await OrderItemsModel.getByOrderId(orderId);

			// Emit socket event for order creation
			socketService.emitOrderCreated(orderId, {
				order_id: orderId,
				order_no: payload.ORDER_NO,
				table_id: payload.TABLE_ID,
				status: payload.STATUS,
				grand_total: payload.GRAND_TOTAL,
				items: orderItems,
				items_count: items.length
			});

			// Notify the user who created the order (branch-scoped)
			const notifyUserId = req.session?.user_id || req.user?.user_id;
			const branchIdForNotif = parseInt(payload.BRANCH_ID, 10);
			const validBranchId = Number.isFinite(branchIdForNotif) ? branchIdForNotif : 1;
			if (!notifyUserId) {
				console.warn('[ORDER] No user_id for notification (req.user?.user_id missing?). Order #' + payload.ORDER_NO);
			} else {
				try {
					const created = await NotificationModel.create({
						user_id: notifyUserId,
						branch_id: validBranchId,
						title: 'New Order',
						message: `Order #${payload.ORDER_NO} created. Total: ₱${Number(payload.GRAND_TOTAL).toLocaleString()}`,
						type: 'order',
						link: null
					});
					console.log('[ORDER] Notification created for user_id=' + notifyUserId + ', branch_id=' + validBranchId + ', order #' + payload.ORDER_NO);
					// Real-time: emit to user's socket room so bell updates immediately
					if (created && created.insertId) {
						const notificationPayload = {
							id: created.insertId,
							userId: notifyUserId,
							branchId: validBranchId,
							title: 'New Order',
							message: `Order #${payload.ORDER_NO} created. Total: ₱${Number(payload.GRAND_TOTAL).toLocaleString()}`,
							type: 'order',
							link: null,
							isRead: false,
							createdAt: (created.createdAt && created.createdAt.toISOString) ? created.createdAt.toISOString() : new Date().toISOString()
						};
						socketService.emitNotificationCreated(notifyUserId, notificationPayload);
					}
				} catch (notifErr) {
					if (notifErr.code === 'ER_NO_SUCH_TABLE' || notifErr.errno === 1146) {
						console.warn('[ORDER] Notifications table missing. Run: restoBackend/scripts/migrations/2026-02-11-notifications-table.sql');
					} else {
						console.error('[ORDER] Notification create failed:', notifErr.message || notifErr);
					}
				}
			}

			return ApiResponse.created(res, { id: orderId, order_no: payload.ORDER_NO }, 'Order created successfully');
		} catch (error) {
			console.error('Error creating order:', error);
			return ApiResponse.error(res, 'Failed to create order', 500, error.message);
		}
	}

	static async update(req, res) {
		try {
			const { id } = req.params;
			const oldOrder = await OrderModel.getById(id);
			if (!oldOrder) {
				return res.status(404).json({ error: 'Order not found' });
			}

			const payload = {
				TABLE_ID: req.body.TABLE_ID,
				ORDER_TYPE: req.body.ORDER_TYPE,
				STATUS: parseInt(req.body.STATUS) || 3,
				SUBTOTAL: parseFloat(req.body.SUBTOTAL) || 0,
				TAX_AMOUNT: parseFloat(req.body.TAX_AMOUNT) || 0,
				SERVICE_CHARGE: parseFloat(req.body.SERVICE_CHARGE) || 0,
				DISCOUNT_AMOUNT: parseFloat(req.body.DISCOUNT_AMOUNT) || 0,
				GRAND_TOTAL: parseFloat(req.body.GRAND_TOTAL) || 0,
				user_id: req.session?.user_id || req.user?.user_id
			};

			if (payload.STATUS === 1) {
				await InventoryDeductionService.settleOrderWithInventory(Number(id), payload.user_id);
			}
			const updated = payload.STATUS === 1 ? true : await OrderModel.update(id, payload);
			// Only replace order items if ORDER_ITEMS is explicitly provided in the request
			if (req.body.ORDER_ITEMS !== undefined) {
				const items = Array.isArray(req.body.ORDER_ITEMS) ? req.body.ORDER_ITEMS : [];
				await OrderItemsModel.replaceForOrder(id, items, req.session.user_id);
			}

			const existingBilling = await BillingModel.getByOrderId(id);
			if (existingBilling) {
				await BillingModel.updateForOrder(id, {
					amount_due: payload.GRAND_TOTAL
				});
			} else {
				const order = await OrderModel.getById(id);
				await BillingModel.createForOrder({
					branch_id: order?.BRANCH_ID,
					order_id: id,
					amount_due: payload.GRAND_TOTAL,
					status: 3,
					user_id: req.session.user_id || req.user?.user_id
				});
			}

			// Handle Table Status Changes
			if (payload.STATUS === 1 || payload.STATUS === -1) {
				// Order is SETTLED (1) or CANCELLED (-1) -> Set table to AVAILABLE (1)
				if (payload.TABLE_ID) {
					await TableModel.updateStatus(payload.TABLE_ID, 1);
				}
			} else {
				// Order is still active
				if (oldOrder.TABLE_ID != payload.TABLE_ID) {
					// Table changed
					if (oldOrder.TABLE_ID) {
						await TableModel.updateStatus(oldOrder.TABLE_ID, 1); // Set old table to AVAILABLE
					}
					if (payload.TABLE_ID) {
						await TableModel.updateStatus(payload.TABLE_ID, 2); // Set new table to OCCUPIED
					}
				} else if (payload.TABLE_ID) {
					// Same table, ensure it's OCCUPIED
					await TableModel.updateStatus(payload.TABLE_ID, 2);
				}
			}

			// Get updated order data with items for socket emission
			const updatedOrder = await OrderModel.getById(id);
			const orderItems = await OrderItemsModel.getByOrderId(id);

			// Emit socket event for order update
			socketService.emitOrderUpdate(id, {
				order_id: id,
				order_no: updatedOrder.ORDER_NO,
				table_id: updatedOrder.TABLE_ID,
				order_type: updatedOrder.ORDER_TYPE,
				status: updatedOrder.STATUS,
				grand_total: updatedOrder.GRAND_TOTAL,
				items: orderItems
			});

			return ApiResponse.success(res, null, 'Order updated successfully');
		} catch (error) {
			console.error('Error updating order:', error);
			return ApiResponse.error(res, 'Failed to update order', 500, error.message);
		}
	}

	static async getItems(req, res) {
		try {
			const { id } = req.params;
			const items = await OrderItemsModel.getByOrderId(id);
			return ApiResponse.success(res, items, 'Order items retrieved successfully');
		} catch (error) {
			console.error('Error fetching line items:', error);
			return ApiResponse.error(res, 'Failed to fetch order items', 500, error.message);
		}
	}

	static async updateItemStatus(req, res) {
		try {
			const { id } = req.params;
			const { status } = req.body;
			const user_id = req.session.user_id || req.user?.user_id;

			// Get order_id before updating
			const pool = require('../config/db');
			const [itemRows] = await pool.execute('SELECT ORDER_ID FROM order_items WHERE IDNo = ?', [id]);

			const updated = await OrderItemsModel.updateStatus(id, status, user_id);
			if (!updated) {
				return res.status(404).json({ error: 'Item not found' });
			}

			// Get order_id from the item to emit socket event
			if (itemRows.length > 0 && itemRows[0].ORDER_ID) {
				const orderId = itemRows[0].ORDER_ID;
				const order = await OrderModel.getById(orderId);
				const orderItems = await OrderItemsModel.getByOrderId(orderId);

				// Emit socket event for order update (item status changed)
				socketService.emitOrderUpdate(orderId, {
					order_id: orderId,
					order_no: order.ORDER_NO,
					table_id: order.TABLE_ID,
					status: order.STATUS,
					grand_total: order.GRAND_TOTAL,
					items: orderItems
				});
			}

			return ApiResponse.success(res, null, 'Item status updated successfully');
		} catch (error) {
			console.error('Error updating item status:', error);
			return ApiResponse.error(res, 'Failed to update item status', 500, error.message);
		}
	}

	// Get single order item by ID
	static async getOrderItemById(req, res) {
		try {
			const { id } = req.params;
			const pool = require('../config/db');
			const [rows] = await pool.execute(`
				SELECT 
					oi.IDNo,
					oi.ORDER_ID,
					oi.MENU_ID,
					m.MENU_NAME,
					oi.QTY,
					oi.UNIT_PRICE,
					oi.LINE_TOTAL,
					oi.STATUS,
					oi.REMARKS,
					oi.ENCODED_DT,
					oi.EDITED_DT,
					u.FIRSTNAME AS PREPARED_BY
				FROM order_items oi
				LEFT JOIN menu m ON m.IDNo = oi.MENU_ID
				LEFT JOIN user_info u ON u.IDNo = oi.EDITED_BY
				WHERE oi.IDNo = ?
			`, [id]);

			if (rows.length === 0) {
				return ApiResponse.notFound(res, 'Order item');
			}

			return ApiResponse.success(res, rows[0], 'Order item retrieved successfully');
		} catch (error) {
			console.error('Error fetching order item:', error);
			return ApiResponse.error(res, 'Failed to fetch order item', 500, error.message);
		}
	}

	// Update single order item
	static async updateOrderItem(req, res) {
		try {
			const { id } = req.params;
			const { qty, unit_price, status, remarks } = req.body;
			const user_id = req.session.user_id || req.user?.user_id;

			const pool = require('../config/db');

			// Get existing item
			const [itemRows] = await pool.execute('SELECT * FROM order_items WHERE IDNo = ?', [id]);
			if (itemRows.length === 0) {
				return ApiResponse.notFound(res, 'Order item');
			}

			const existingItem = itemRows[0];
			const orderId = existingItem.ORDER_ID;

			// Calculate new line total
			const newQty = qty !== undefined ? parseFloat(qty) : existingItem.QTY;
			const newUnitPrice = unit_price !== undefined ? parseFloat(unit_price) : existingItem.UNIT_PRICE;
			const newLineTotal = newQty * newUnitPrice;

			// Update order item
			const updateQuery = `
				UPDATE order_items SET
					QTY = ?,
					UNIT_PRICE = ?,
					LINE_TOTAL = ?,
					STATUS = ?,
					REMARKS = ?,
					EDITED_BY = ?,
					EDITED_DT = CURRENT_TIMESTAMP
				WHERE IDNo = ?
			`;
			await pool.execute(updateQuery, [
				newQty,
				newUnitPrice,
				newLineTotal,
				status !== undefined ? status : existingItem.STATUS,
				remarks !== undefined ? remarks : existingItem.REMARKS,
				user_id,
				id
			]);

			// Recalculate order totals
			const [allItems] = await pool.execute('SELECT LINE_TOTAL FROM order_items WHERE ORDER_ID = ?', [orderId]);
			const newSubtotal = allItems.reduce((sum, item) => sum + parseFloat(item.LINE_TOTAL || 0), 0);

			const order = await OrderModel.getById(orderId);
			const taxAmount = parseFloat(order.TAX_AMOUNT || 0);
			const serviceCharge = parseFloat(order.SERVICE_CHARGE || 0);
			const discountAmount = parseFloat(order.DISCOUNT_AMOUNT || 0);
			const newGrandTotal = newSubtotal + taxAmount + serviceCharge - discountAmount;

			// Update order totals
			await OrderModel.update(orderId, {
				TABLE_ID: order.TABLE_ID,
				ORDER_TYPE: order.ORDER_TYPE,
				STATUS: order.STATUS,
				SUBTOTAL: newSubtotal,
				TAX_AMOUNT: taxAmount,
				SERVICE_CHARGE: serviceCharge,
				DISCOUNT_AMOUNT: discountAmount,
				GRAND_TOTAL: newGrandTotal,
				user_id: user_id
			});

			// Update billing if exists
			const BillingModel = require('../models/billingModel');
			const existingBilling = await BillingModel.getByOrderId(orderId);
			if (existingBilling) {
				await BillingModel.updateForOrder(orderId, {
					amount_due: newGrandTotal
				});
			}

			// Emit socket event
			const orderItems = await OrderItemsModel.getByOrderId(orderId);
			socketService.emitOrderUpdate(orderId, {
				order_id: orderId,
				order_no: order.ORDER_NO,
				table_id: order.TABLE_ID,
				status: order.STATUS,
				grand_total: newGrandTotal,
				items: orderItems
			});

			return ApiResponse.success(res, {
				item_id: parseInt(id),
				new_subtotal: newSubtotal,
				new_grand_total: newGrandTotal
			}, 'Order item updated successfully');
		} catch (error) {
			console.error('Error updating order item:', error);
			return ApiResponse.error(res, 'Failed to update order item', 500, error.message);
		}
	}

	// Delete single order item
	static async deleteOrderItem(req, res) {
		try {
			const { id } = req.params;
			const user_id = req.session.user_id || req.user?.user_id;

			const pool = require('../config/db');

			// Get existing item
			const [itemRows] = await pool.execute('SELECT * FROM order_items WHERE IDNo = ?', [id]);
			if (itemRows.length === 0) {
				return ApiResponse.notFound(res, 'Order item');
			}

			const existingItem = itemRows[0];
			const orderId = existingItem.ORDER_ID;

			// Delete order item
			await pool.execute('DELETE FROM order_items WHERE IDNo = ?', [id]);

			// Recalculate order totals
			const [allItems] = await pool.execute('SELECT LINE_TOTAL FROM order_items WHERE ORDER_ID = ?', [orderId]);
			const newSubtotal = allItems.reduce((sum, item) => sum + parseFloat(item.LINE_TOTAL || 0), 0);

			const order = await OrderModel.getById(orderId);
			const taxAmount = parseFloat(order.TAX_AMOUNT || 0);
			const serviceCharge = parseFloat(order.SERVICE_CHARGE || 0);
			const discountAmount = parseFloat(order.DISCOUNT_AMOUNT || 0);
			const newGrandTotal = newSubtotal + taxAmount + serviceCharge - discountAmount;

			// Update order totals
			await OrderModel.update(orderId, {
				TABLE_ID: order.TABLE_ID,
				ORDER_TYPE: order.ORDER_TYPE,
				STATUS: order.STATUS,
				SUBTOTAL: newSubtotal,
				TAX_AMOUNT: taxAmount,
				SERVICE_CHARGE: serviceCharge,
				DISCOUNT_AMOUNT: discountAmount,
				GRAND_TOTAL: newGrandTotal,
				user_id: user_id
			});

			// Update billing if exists
			const BillingModel = require('../models/billingModel');
			const existingBilling = await BillingModel.getByOrderId(orderId);
			if (existingBilling) {
				await BillingModel.updateForOrder(orderId, {
					amount_due: newGrandTotal
				});
			}

			// Emit socket event
			const orderItems = await OrderItemsModel.getByOrderId(orderId);
			socketService.emitOrderUpdate(orderId, {
				order_id: orderId,
				order_no: order.ORDER_NO,
				table_id: order.TABLE_ID,
				status: order.STATUS,
				grand_total: newGrandTotal,
				items: orderItems
			});

			return ApiResponse.success(res, null, 'Order item deleted successfully');
		} catch (error) {
			console.error('Error deleting order item:', error);
			return ApiResponse.error(res, 'Failed to delete order item', 500, error.message);
		}
	}

	// Update order status directly
	static async updateStatus(req, res) {
		try {
			const { id } = req.params;
			const { status } = req.body;
			const user_id = req.session.user_id || req.user?.user_id;

			if (!status && status !== 0) {
				return ApiResponse.badRequest(res, 'Status is required');
			}

			const order = await OrderModel.getById(id);
			if (!order) {
				return ApiResponse.notFound(res, 'Order');
			}

			const parsedStatus = parseInt(status);
			let updated = false;
			if (parsedStatus === 1) {
				await InventoryDeductionService.settleOrderWithInventory(Number(id), user_id);
				updated = true;
			} else {
				updated = await OrderModel.updateStatus(id, parsedStatus, user_id);
			}
			if (!updated) {
				return ApiResponse.error(res, 'Failed to update order status', 500);
			}

			// Handle table status if order is settled or cancelled
			const TableModel = require('../models/tableModel');
			if (parsedStatus === 1 || parsedStatus === -1) {
				// Order is SETTLED (1) or CANCELLED (-1) -> Set table to AVAILABLE (1)
				if (order.TABLE_ID) {
					await TableModel.updateStatus(order.TABLE_ID, 1);
				}
			}

			// Emit socket event
			const updatedOrder = await OrderModel.getById(id);
			const orderItems = await OrderItemsModel.getByOrderId(id);
			socketService.emitOrderUpdate(id, {
				order_id: id,
				order_no: updatedOrder.ORDER_NO,
				table_id: updatedOrder.TABLE_ID,
				status: updatedOrder.STATUS,
				grand_total: updatedOrder.GRAND_TOTAL,
				items: orderItems
			});

			return ApiResponse.success(res, { order_id: parseInt(id), status: parsedStatus }, 'Order status updated successfully');
		} catch (error) {
			console.error('Error updating order status:', error);
			return ApiResponse.error(res, 'Failed to update order status', 500, error.message);
		}
	}
}

module.exports = OrderController;

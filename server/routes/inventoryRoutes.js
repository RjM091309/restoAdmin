const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/unifiedAuth');
const InventoryController = require('../controllers/inventoryController');

router.get('/inventory/products', authenticate, InventoryController.getProducts);
router.post('/inventory/products', authenticate, InventoryController.createProduct);
router.put('/inventory/products/:id', authenticate, InventoryController.updateProduct);
router.delete('/inventory/products/:id', authenticate, InventoryController.deleteProduct);

router.get('/inventory/materials', authenticate, InventoryController.getMaterials);
router.post('/inventory/materials', authenticate, InventoryController.createMaterial);
router.put('/inventory/materials/:id', authenticate, InventoryController.updateMaterial);
router.delete('/inventory/materials/:id', authenticate, InventoryController.deleteMaterial);

router.get('/inventory/menu/:menuId/mappings', authenticate, InventoryController.getMenuMappings);
router.put('/inventory/menu/:menuId/mappings', authenticate, InventoryController.saveMenuMappings);
router.get('/inventory/stock-ins', authenticate, InventoryController.getStockIns);
router.post('/inventory/stock-ins', authenticate, InventoryController.createStockIn);
router.put('/inventory/stock-ins/:id', authenticate, InventoryController.updateStockIn);
router.delete('/inventory/stock-ins/:id', authenticate, InventoryController.deleteStockIn);
router.get('/inventory/audit-trail', authenticate, InventoryController.getAuditTrail);

router.get('/inventory/categories', authenticate, InventoryController.getCategories);
router.post('/inventory/categories', authenticate, InventoryController.createCategory);
router.put('/inventory/categories/:id', authenticate, InventoryController.updateCategory);
router.delete('/inventory/categories/:id', authenticate, InventoryController.deleteCategory);

module.exports = router;

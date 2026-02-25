const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/unifiedAuth');
const CategoryInventoryController = require('../controllers/categoryInventoryController');

router.get('/inventory/categories', authenticate, CategoryInventoryController.getAll);
router.get('/inventory/categories/:id', authenticate, CategoryInventoryController.getById);
router.post('/inventory/categories', authenticate, CategoryInventoryController.create);
router.put('/inventory/categories/:id', authenticate, CategoryInventoryController.update);
router.delete('/inventory/categories/:id', authenticate, CategoryInventoryController.delete);

module.exports = router;

const express = require('express')
const router = express.Router();
const menuController = require('../controllers/menuController');
const { requireAuth, requireRole } = require('../middleware/auth');

// customer routes
router.get('/available', menuController.getAvailableItems);
router.get('/category/:category', menuController.getItemsByCategory);
router.get('/:cafeId', menuController.getMenuByCafe);

//admin routes

router.post('/add', requireAuth, requireRole(['cafe_admin', 'super_admin']), menuController.adddMenuItem);
router.put('/update/:id', requireAuth, requireRole(['cafe_admin', 'super_admin']), menuController.updateMenuItem);
router.delete('/delete/:id', requireAuth, requireRole(['cafe_admin', 'super_admin']), menuController.deleteMenuItem);
router.patch('/toggle/:id', requireAuth, requireRole(['cafe_admin', 'super_admin']), menuController.toggleAvailability);

module.exports = router;

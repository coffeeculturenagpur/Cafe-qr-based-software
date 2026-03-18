const express = require("express");
const router = express.Router();
const menuController = require("../controllers/menuController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Admin-only menu CRUD that always derives cafeId from token (unless super_admin).
router.use(requireAuth);
router.use(requireRole(["cafe_admin", "super_admin"]));

router.post("/", menuController.adddMenuItem);
router.get("/", menuController.listAdminMenuItems);
router.put("/:id", menuController.updateMenuItem);
router.delete("/:id", menuController.deleteMenuItem);
router.patch("/:id/toggle", menuController.toggleAvailability);

module.exports = router;

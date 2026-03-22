const express = require("express");
const router = express.Router();
const multer = require("multer");
const menuController = require("../controllers/menuController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Admin-only menu CRUD that always derives cafeId from token (unless super_admin).
router.use(requireAuth);
router.use(requireRole(["cafe_admin", "super_admin"]));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/", menuController.adddMenuItem);
router.get("/", menuController.listAdminMenuItems);
router.post("/bulk-preview", upload.single("file"), menuController.previewMenuCsv);
router.post("/bulk-upload", upload.single("file"), menuController.bulkUploadMenuItems);
router.delete("/all", menuController.deleteAllMenuItems);
router.put("/:id", menuController.updateMenuItem);
router.delete("/:id", menuController.deleteMenuItem);
router.patch("/:id/toggle", menuController.toggleAvailability);

module.exports = router;

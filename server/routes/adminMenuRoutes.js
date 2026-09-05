const express = require("express");
const router = express.Router();
const multer = require("multer");
const menuController = require("../controllers/menuController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Admin-only menu CRUD that always derives cafeId from token (unless super_admin).
router.use(requireAuth);
router.use(requireRole(["cafe_admin", "super_admin"]));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const handleFileUpload = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File size too large (max 10MB)" });
      }
      return res.status(400).json({ message: err.message || "File upload error" });
    }
    if (Array.isArray(req.files) && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

router.post("/", menuController.adddMenuItem);
router.get("/", menuController.listAdminMenuItems);
router.post("/bulk-preview", handleFileUpload, menuController.previewMenuCsv);
router.post("/bulk-upload", handleFileUpload, menuController.bulkUploadMenuItems);
router.delete("/all", menuController.deleteAllMenuItems);
router.put("/:id", menuController.updateMenuItem);
router.delete("/:id", menuController.deleteMenuItem);
router.patch("/:id/toggle", menuController.toggleAvailability);

module.exports = router;

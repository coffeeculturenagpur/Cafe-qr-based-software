const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/search", requireAuth, requireRole(["kitchen", "staff", "cafe_admin", "super_admin"]), customerController.searchCustomers);
router.get("/me", customerController.getMe);
router.get("/me/favorites", customerController.getFavorites);

module.exports = router;

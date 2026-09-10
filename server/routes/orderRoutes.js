const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/", orderController.createOrder);
router.post(
  "/staff",
  requireAuth,
  requireRole(["kitchen", "staff", "cafe_admin", "super_admin"]),
  orderController.createStaffOrder
);
router.get("/venue/table/:tableNumber", orderController.listOrdersByTableVenue);
router.get("/:cafeId/mine", orderController.listMyOrdersInCafe);
router.get("/:cafeId/table/:tableNumber", orderController.listOrdersByTable);
router.get("/:cafeId/id/:id", orderController.getOrderById);
router.get(
  "/:cafeId/popular-items",
  requireAuth,
  requireRole(["kitchen", "staff", "cafe_admin", "super_admin"]),
  orderController.getPopularMenuItemsByCafe
);
router.get(
  "/:cafeId",
  requireAuth,
  requireRole(["kitchen", "staff", "cafe_admin", "super_admin"]),
  orderController.listOrdersByCafe
);
router.put(
  "/:id",
  requireAuth,
  requireRole(["kitchen", "staff", "cafe_admin", "super_admin"]),
  orderController.updateOrder
);

module.exports = router;


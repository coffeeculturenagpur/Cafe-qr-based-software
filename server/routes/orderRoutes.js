const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/", orderController.createOrder);
router.get("/venue/table/:tableNumber", orderController.listOrdersByTableVenue);
router.get("/:cafeId/mine", orderController.listMyOrdersInCafe);
router.get("/:cafeId/table/:tableNumber", orderController.listOrdersByTable);
router.get("/:cafeId/id/:id", orderController.getOrderById);
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


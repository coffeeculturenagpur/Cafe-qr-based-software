const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.post("/", orderController.createOrder);
router.get("/:cafeId", orderController.listOrdersByCafe);
router.put("/:id", orderController.updateOrder);

module.exports = router;


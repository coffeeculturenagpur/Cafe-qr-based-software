const Order = require("../models/Order");
const { emitCafeEvent } = require("../realtime/socket");

exports.createOrder = async (req, res) => {
  try {
    const { cafeId, tableNumber, customerName, phone, items } = req.body;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!customerName) return res.status(400).json({ message: "customerName is required" });
    if (!phone) return res.status(400).json({ message: "phone is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
      0
    );

    const order = await Order.create({
      cafeId,
      tableNumber,
      customerName,
      phone,
      items,
      totalAmount,
      status: "pending",
    });

    emitCafeEvent(order.cafeId, "NEW_ORDER", order);

    return res.status(201).json(order);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.listOrdersByCafe = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const orders = await Order.find({ cafeId }).sort({ createdAt: -1 });
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const { status } = req.body;
    const update = { ...req.body };
    if (status === "paid") {
      update.paidAt = new Date();
    }

    const prev = await Order.findById(req.params.id);
    if (!prev) return res.status(404).json({ message: "Order not found" });

    const prevStatus = prev.status;

    const order = await Order.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    emitCafeEvent(order.cafeId, "ORDER_UPDATED", order);

    if (prevStatus !== order.status) {
      if (order.status === "ready") emitCafeEvent(order.cafeId, "ORDER_READY", order);
      if (order.status === "paid") emitCafeEvent(order.cafeId, "ORDER_PAID", order);
    }
    return res.json(order);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

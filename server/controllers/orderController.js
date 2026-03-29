const Order = require("../models/Order");
const Table = require("../models/Table");
const Cafe = require("../models/Cafe");
const MenuItem = require("../models/MenuItem");
const { emitCafeEvent } = require("../realtime/socket");
const { canAccessCafe, forbiddenTenant } = require("../utils/tenant");
const { computeOrderTotals } = require("../utils/pricing");
const { haversineMeters } = require("../utils/geo");
const { verifyTableToken } = require("../utils/tableToken");
const {
  upsertCustomerFromOrder,
  signCustomerCookie,
  getCurrentCustomer,
} = require("../controllers/customerController");
const { normalizePhone } = require("../utils/phone");

exports.listOrdersByTableVenue = async (req, res) => {
  const cafeId = process.env.DEFAULT_CAFE_ID;
  if (!cafeId) {
    return res.status(500).json({ message: "DEFAULT_CAFE_ID is not set on the server" });
  }
  req.params.cafeId = cafeId;
  return exports.listOrdersByTable(req, res);
};

exports.createOrder = async (req, res) => {
  try {
    const {
      cafeId,
      tableNumber,
      customerName,
      phone,
      items,
      notes,
      visitId,
      customerLat,
      customerLng,
      tableToken,
      paymentMode,
    } = req.body;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    const visit = typeof visitId === "string" ? visitId.trim() : "";
    if (!visit) return res.status(400).json({ message: "visitId is required" });

    const cafe = await Cafe.findById(cafeId).lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });
    if (cafe.isActive === false) {
      return res.status(403).json({ message: "This cafe is not accepting orders" });
    }

    const hasFence =
      typeof cafe.latitude === "number" &&
      typeof cafe.longitude === "number" &&
      !Number.isNaN(cafe.latitude) &&
      !Number.isNaN(cafe.longitude) &&
      Number(cafe.serviceRadiusMeters) > 0;
    if (hasFence) {
      const lat = Number(customerLat);
      const lng = Number(customerLng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({
          message: "Location is required to place an order at this venue. Please enable location services and try again.",
        });
      }
      const dist = haversineMeters(lat, lng, cafe.latitude, cafe.longitude);
      if (dist > Number(cafe.serviceRadiusMeters)) {
        return res.status(403).json({
          message: "You appear to be outside this restaurant's ordering area. If you want to order, please come to the restaurant's location.",
        });
      }
    }
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!verifyTableToken(cafeId, tableNumber, tableToken)) {
      return res.status(403).json({ message: "Invalid table token" });
    }
    if (!customerName) return res.status(400).json({ message: "customerName is required" });
    if (!phone) return res.status(400).json({ message: "phone is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const normalizedLines = items.map((line) => {
      const menuItemId = line?.menuItemId;
      const qty = Number(line?.qty);
      return { menuItemId, qty };
    });

    for (const line of normalizedLines) {
      if (!line.menuItemId) {
        return res.status(400).json({ message: "Each item must include menuItemId" });
      }
      if (!line.qty || line.qty < 1) {
        return res.status(400).json({ message: "Each item must have qty >= 1" });
      }
    }

    const menuIds = normalizedLines.map((line) => line.menuItemId);
    const menuDocs = await MenuItem.find({
      _id: { $in: menuIds },
      cafeId,
      isAvailable: true,
    })
      .select("_id name price")
      .lean();

    const menuMap = new Map(menuDocs.map((doc) => [String(doc._id), doc]));
    if (menuMap.size !== menuIds.length) {
      return res.status(400).json({
        message: "One or more items are unavailable or do not belong to this cafe",
      });
    }

    const resolvedItems = [];
    let lineSubtotal = 0;

    for (const line of normalizedLines) {
      const menuDoc = menuMap.get(String(line.menuItemId));
      if (!menuDoc) {
        return res.status(400).json({
          message: "One or more items are unavailable or do not belong to this cafe",
        });
      }

      const unitPrice = Number(menuDoc.price);
      lineSubtotal += unitPrice * line.qty;
      resolvedItems.push({
        menuItemId: menuDoc._id,
        name: menuDoc.name,
        price: unitPrice,
        qty: line.qty,
      });
    }

    const { subtotalAmount, discountAmount, taxAmount, totalAmount } = computeOrderTotals(cafe, lineSubtotal);

    const normalizedPayment =
      typeof paymentMode === "string" ? paymentMode.trim().toLowerCase() : "";
    const paymentValue = normalizedPayment || "cash";
    if (!["cash", "upi"].includes(paymentValue)) {
      return res.status(400).json({ message: "paymentMode must be 'cash' or 'upi'" });
    }

    const order = await Order.create({
      cafeId,
      tableNumber,
      visitId: visit,
      customerName,
      phone,
      notes: typeof notes === "string" ? notes.trim() : "",
      items: resolvedItems,
      subtotalAmount,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMode: paymentValue,
      status: "pending",
    });

    await Table.findOneAndUpdate(
      { cafeId, tableNumber },
      { $set: { status: "reserved" } }
    );

    emitCafeEvent(order.cafeId, "NEW_ORDER", order);

    try {
      const cust = await upsertCustomerFromOrder({
        phone,
        name: customerName,
        tableNumber,
        cafeId,
      });
      if (cust) signCustomerCookie(res, cust, req);
    } catch {
      // non-fatal
    }

    return res.status(201).json(order);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.listOrdersByCafe = async (req, res) => {
  try {
    const { cafeId } = req.params;
    if (!canAccessCafe(req.user, cafeId)) {
      return forbiddenTenant(res);
    }
    const q = { cafeId };
    const { from, to, minTotal, maxTotal, status } = req.query;

    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(String(from));
      if (to) q.createdAt.$lte = new Date(String(to));
    }

    if (minTotal !== undefined && minTotal !== "" && !Number.isNaN(Number(minTotal))) {
      q.totalAmount = { ...(q.totalAmount || {}), $gte: Number(minTotal) };
    }
    if (maxTotal !== undefined && maxTotal !== "" && !Number.isNaN(Number(maxTotal))) {
      q.totalAmount = { ...(q.totalAmount || {}), $lte: Number(maxTotal) };
    }

    if (status && String(status).trim()) {
      const parts = String(status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 1) q.status = parts[0];
      else if (parts.length > 1) q.status = { $in: parts };
    }

    // Waiter/staff should only see live orders after the chef marks them ready.
    // History view (scope=history) is allowed to see all statuses.
    if (req.user?.role === "staff" && String(req.query.scope || "") !== "history") {
      const staffVisible = ["ready", "served"];
      if (q.status) {
        const current = Array.isArray(q.status.$in)
          ? q.status.$in
          : [q.status];
        q.status = { $in: current.filter((s) => staffVisible.includes(s)) };
      } else {
        q.status = { $in: staffVisible };
      }
    }

    const orders = await Order.find(q).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.listOrdersByTable = async (req, res) => {
  try {
    const { cafeId, tableNumber } = req.params;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    const token = req.query.t || req.query.tableToken || "";
    if (!verifyTableToken(cafeId, tableNumber, token)) {
      return res.status(403).json({ message: "Invalid table token" });
    }
    const q = { cafeId, tableNumber: Number(tableNumber) };
    const vid = typeof req.query.visitId === "string" ? req.query.visitId.trim() : "";
    if (vid) q.visitId = vid;
    const orders = await Order.find(q).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.listMyOrdersInCafe = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const tableNumber = req.query.tableNumber || req.query.table || "";
    const token = req.query.t || req.query.tableToken || "";

    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!verifyTableToken(cafeId, tableNumber, token)) {
      return res.status(403).json({ message: "Invalid table token" });
    }

    const current = await getCurrentCustomer(req);
    if (current.status) return res.status(current.status).json({ message: current.message });

    const normalized = normalizePhone(current.customer?.phone);
    if (!normalized) return res.json([]);

    const orders = await Order.find({
      cafeId,
      phone: normalized,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { cafeId, id } = req.params;
    const order = await Order.findOne({ _id: id, cafeId }).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });
    return res.json(order);
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
    if (!canAccessCafe(req.user, prev.cafeId)) {
      return forbiddenTenant(res);
    }

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

    if (["served", "paid", "rejected"].includes(order.status)) {
      await Table.findOneAndUpdate(
        { cafeId: order.cafeId, tableNumber: order.tableNumber },
        { $set: { status: "free" } }
      );
    }

    return res.json(order);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

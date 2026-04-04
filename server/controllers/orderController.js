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
} = require("../controllers/customerController");
const { normalizePhone } = require("../utils/phone");
const { getClientIpKey } = require("../utils/clientIp");

function normalizePaymentMode(value, fallback = "cash") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const paymentValue = normalized || fallback;
  if (!["cash", "upi"].includes(paymentValue)) {
    throw new Error("paymentMode must be 'cash' or 'upi'");
  }
  return paymentValue;
}

async function resolveOrderItems(cafeId, items, { allowUnavailable = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("items[] is required");
    error.status = 400;
    throw error;
  }

  const normalizedLines = items.map((line) => {
    const menuItemId = line?.menuItemId;
    const qty = Number(line?.qty);
    return { menuItemId, qty };
  });

  for (const line of normalizedLines) {
    if (!line.menuItemId) {
      const error = new Error("Each item must include menuItemId");
      error.status = 400;
      throw error;
    }
    if (!line.qty || line.qty < 1) {
      const error = new Error("Each item must have qty >= 1");
      error.status = 400;
      throw error;
    }
  }

  const menuIds = normalizedLines.map((line) => line.menuItemId);
  const menuQuery = {
    _id: { $in: menuIds },
    cafeId,
  };
  if (!allowUnavailable) {
    menuQuery.isAvailable = true;
  }

  const menuDocs = await MenuItem.find(menuQuery)
    .select("_id name price isAvailable")
    .lean();

  const menuMap = new Map(menuDocs.map((doc) => [String(doc._id), doc]));
  if (menuMap.size !== menuIds.length) {
    const error = new Error("One or more items are unavailable or do not belong to this cafe");
    error.status = 400;
    throw error;
  }

  const resolvedItems = [];
  let lineSubtotal = 0;

  for (const line of normalizedLines) {
    const menuDoc = menuMap.get(String(line.menuItemId));
    if (!menuDoc) {
      const error = new Error("One or more items are unavailable or do not belong to this cafe");
      error.status = 400;
      throw error;
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

  return { resolvedItems, lineSubtotal };
}

async function buildResolvedOrderPayload(cafeId, items) {
  const cafe = await Cafe.findById(cafeId).lean();
  if (!cafe) {
    const error = new Error("Cafe not found");
    error.status = 404;
    throw error;
  }

  const { resolvedItems, lineSubtotal } = await resolveOrderItems(cafeId, items);
  const { subtotalAmount, discountAmount, taxAmount, totalAmount } = computeOrderTotals(cafe, lineSubtotal);

  return { cafe, resolvedItems, subtotalAmount, discountAmount, taxAmount, totalAmount };
}

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
    const normalizedPhone = normalizePhone(String(phone));
    if (!normalizedPhone) return res.status(400).json({ message: "phone is required" });
    const customerIpKey = getClientIpKey(req);
    if (!customerIpKey) return res.status(400).json({ message: "Could not determine client IP" });

    const { resolvedItems, lineSubtotal } = await resolveOrderItems(cafeId, items);
    const { subtotalAmount, discountAmount, taxAmount, totalAmount } = computeOrderTotals(cafe, lineSubtotal);
    const paymentValue = normalizePaymentMode(paymentMode, "cash");

    const order = await Order.create({
      cafeId,
      tableNumber,
      visitId: visit,
      customerIpKey,
      customerName,
      phone: normalizedPhone,
      notes: typeof notes === "string" ? notes.trim() : "",
      items: resolvedItems,
      subtotalAmount,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMode: paymentValue,
      source: "qr",
      status: "pending",
    });

    await Table.findOneAndUpdate(
      { cafeId, tableNumber },
      { $set: { status: "reserved" } }
    );

    emitCafeEvent(order.cafeId, "NEW_ORDER", order);

    try {
      const cust = await upsertCustomerFromOrder({
        phone: normalizedPhone,
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

    const customerIpKey = getClientIpKey(req);
    if (!customerIpKey) return res.json([]);

    const query = {
      cafeId,
      tableNumber: Number(tableNumber),
      customerIpKey,
    };

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res.json(orders);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error", error });
  }
};

exports.createStaffOrder = async (req, res) => {
  try {
    const actorCafeId = req.user?.cafeId ? String(req.user.cafeId) : "";
    const cafeId = req.user?.role === "super_admin" ? req.body?.cafeId || actorCafeId : actorCafeId;
    const tableNumber = Number(req.body?.tableNumber);
    const customerName = String(req.body?.customerName || "").trim() || "Walk-in guest";
    const phone = String(req.body?.phone || "").trim() || `manual-table-${tableNumber}`;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    const status = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "pending";

    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!canAccessCafe(req.user, cafeId)) return forbiddenTenant(res);
    if (!tableNumber || tableNumber < 1) {
      return res.status(400).json({ message: "tableNumber must be >= 1" });
    }

    const allowedStatuses = ["pending", "accepted", "preparing", "ready", "served"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status for manual order" });
    }

    const { cafe, resolvedItems, subtotalAmount, discountAmount, taxAmount, totalAmount } =
      await buildResolvedOrderPayload(cafeId, req.body?.items);

    if (cafe.isActive === false) {
      return res.status(403).json({ message: "This cafe is not accepting orders" });
    }

    const order = await Order.create({
      cafeId,
      tableNumber,
      visitId: "",
      customerName,
      phone,
      notes,
      items: resolvedItems,
      subtotalAmount,
      discountAmount,
      taxAmount,
      totalAmount,
      paymentMode: normalizePaymentMode(req.body?.paymentMode, "cash"),
      source: "manual",
      status,
    });

    await Table.findOneAndUpdate(
      { cafeId, tableNumber },
      { $set: { status: ["served", "paid", "rejected"].includes(status) ? "free" : "reserved" } }
    );

    emitCafeEvent(order.cafeId, "NEW_ORDER", order);
    return res.status(201).json(order);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error", error });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { cafeId, id } = req.params;
    const tableNumber = req.query.tableNumber || req.query.table || "";
    const token = req.query.t || req.query.tableToken || "";
    const customerIpKey = getClientIpKey(req);
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!verifyTableToken(cafeId, tableNumber, token)) {
      return res.status(403).json({ message: "Invalid table token" });
    }
    if (!customerIpKey) return res.status(403).json({ message: "Could not determine client IP" });
    const order = await Order.findOne({
      _id: id,
      cafeId,
      tableNumber: Number(tableNumber),
      customerIpKey,
    }).lean();
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
    const prevTableNumber = Number(prev.tableNumber);

    if (Object.prototype.hasOwnProperty.call(update, "source")) {
      delete update.source;
    }

    if (Object.prototype.hasOwnProperty.call(update, "tableNumber")) {
      const nextTableNumber = Number(update.tableNumber);
      if (!nextTableNumber || nextTableNumber < 1) {
        return res.status(400).json({ message: "tableNumber must be >= 1" });
      }
      update.tableNumber = nextTableNumber;
    }

    if (Object.prototype.hasOwnProperty.call(update, "paymentMode")) {
      update.paymentMode = normalizePaymentMode(update.paymentMode, prev.paymentMode || "cash");
    }

    if (Object.prototype.hasOwnProperty.call(update, "customerName")) {
      update.customerName = String(update.customerName || "").trim() || prev.customerName;
    }

    if (Object.prototype.hasOwnProperty.call(update, "phone")) {
      update.phone = normalizePhone(String(update.phone || "")) || prev.phone;
    }

    if (Object.prototype.hasOwnProperty.call(update, "notes")) {
      update.notes = typeof update.notes === "string" ? update.notes.trim() : "";
    }

    if (Array.isArray(update.items)) {
      const { resolvedItems, subtotalAmount, discountAmount, taxAmount, totalAmount } =
        await buildResolvedOrderPayload(String(prev.cafeId), update.items);
      update.items = resolvedItems;
      update.subtotalAmount = subtotalAmount;
      update.discountAmount = discountAmount;
      update.taxAmount = taxAmount;
      update.totalAmount = totalAmount;
    }

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
    } else if (["pending", "accepted", "baking", "preparing", "ready"].includes(order.status)) {
      await Table.findOneAndUpdate(
        { cafeId: order.cafeId, tableNumber: order.tableNumber },
        { $set: { status: "reserved" } }
      );
    }

    if (prevTableNumber && prevTableNumber !== Number(order.tableNumber)) {
      const oldTableHasActiveOrders = await Order.exists({
        cafeId: order.cafeId,
        tableNumber: prevTableNumber,
        status: { $nin: ["served", "paid", "rejected"] },
        _id: { $ne: order._id },
      });

      await Table.findOneAndUpdate(
        { cafeId: order.cafeId, tableNumber: prevTableNumber },
        { $set: { status: oldTableHasActiveOrders ? "reserved" : "free" } }
      );
    }

    return res.json(order);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error", error });
  }
};

const mongoose = require("mongoose");
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
const { isValidPhone, normalizePhone } = require("../utils/phone");
const {
  attachOrderToSession,
  getTrackedOrderIds,
  upsertSessionState,
} = require("../services/sessionStore");
const {
  buildCigaretteCategorySet,
  isCigaretteMenuItem,
  assertItemsMatchOrderType,
} = require("../utils/cigarettes");

function businessDayStartLocal({ startHour = 1 } = {}) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(Number(startHour) || 0, 0, 0, 0);
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

function normalizePaymentMode(value, fallback = "cash") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const paymentValue = normalized || fallback;
  if (!["cash", "upi"].includes(paymentValue)) {
    throw new Error("paymentMode must be 'cash' or 'upi'");
  }
  return paymentValue;
}

function validateTableNumberForCafe(tableNumber, cafe) {
  const parsed = Number(tableNumber);
  const tableCount = Number(cafe?.numberOfTables || 0);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error("tableNumber must be a whole number starting at 1");
    error.status = 400;
    throw error;
  }
  if (!tableCount || parsed > tableCount) {
    const error = new Error("tableNumber must be between 1 and " + (tableCount || 0));
    error.status = 400;
    throw error;
  }
  return parsed;
}

function getCigaretteSalePrice(menuItem) {
  const name = String(menuItem?.name || "").trim().toLowerCase();
  if (name === "advance") return 30;
  if (name === "american") return 25;
  return Number(menuItem?.price || 0);
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
    .select("_id name price isAvailable category costPrice stockQty principalAmount profitAmount remainingAmount profitPerPiece")
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

    const unitPrice = getCigaretteSalePrice(menuDoc);
    lineSubtotal += unitPrice * line.qty;
    resolvedItems.push({
      menuItemId: menuDoc._id,
      name: menuDoc.name,
      price: unitPrice,
      costPrice: Number(menuDoc.costPrice || (Number(menuDoc.stockQty) ? Number(menuDoc.principalAmount || 0) / Number(menuDoc.stockQty) : 0)),
      principalPerPiece: Number(menuDoc.costPrice || (Number(menuDoc.stockQty) ? Number(menuDoc.principalAmount || 0) / Number(menuDoc.stockQty) : menuDoc.principalAmount || 0)),
      profitPerPiece: Number(menuDoc.profitPerPiece ?? (unitPrice - Number(menuDoc.costPrice || 0))),
      qty: line.qty,
    });
  }

  return { resolvedItems, lineSubtotal, menuMap };
}

async function buildResolvedOrderPayload(cafeId, items, { allowUnavailable = false } = {}) {
  const cafe = await Cafe.findById(cafeId).lean();
  if (!cafe) {
    const error = new Error("Cafe not found");
    error.status = 404;
    throw error;
  }

  const { resolvedItems, lineSubtotal, menuMap } = await resolveOrderItems(cafeId, items, {
    allowUnavailable,
  });
  const { subtotalAmount, discountAmount, taxAmount, totalAmount } = computeOrderTotals(cafe, lineSubtotal);
  const principalAmount = resolvedItems.reduce((sum, item) => sum + Number(item.principalPerPiece || 0) * Number(item.qty || 0), 0);
  const profitAmount = resolvedItems.reduce((sum, item) => sum + Number(item.profitPerPiece || 0) * Number(item.qty || 0), 0);

  return {
    cafe,
    resolvedItems,
    menuMap,
    cigaretteCategorySet: buildCigaretteCategorySet(cafe),
    subtotalAmount,
    discountAmount,
    taxAmount,
    totalAmount,
    principalAmount: Number(principalAmount.toFixed(2)),
    profitAmount: Number(profitAmount.toFixed(2)),
  };
}

function buildCustomerOrderOwnershipQuery({ sessionId, customerId, visitId }) {
  const ownership = [];
  if (sessionId) ownership.push({ sessionId });
  if (customerId) ownership.push({ customerId });
  if (visitId) ownership.push({ visitId });
  return ownership;
}

function mergeOrderItems(existingItems, incomingItems) {
  const merged = [];
  const byKey = new Map();

  const pushItem = (item) => {
    const menuItemId = item?.menuItemId ? String(item.menuItemId) : "";
    const fallbackKey = `${String(item?.name || "").trim().toLowerCase()}::${Number(item?.price || 0)}`;
    const key = menuItemId || fallbackKey;
    const qty = Number(item?.qty || 0);
    if (!key || qty < 1) return;

    const found = byKey.get(key);
    if (found) {
      found.qty += qty;
      return;
    }

    const normalized = {
      menuItemId: item?.menuItemId || null,
      name: item?.name,
      price: Number(item?.price || 0),
      qty,
    };
    merged.push(normalized);
    byKey.set(key, normalized);
  };

  for (const item of Array.isArray(existingItems) ? existingItems : []) pushItem(item);
  for (const item of Array.isArray(incomingItems) ? incomingItems : []) pushItem(item);

  return merged;
}

function sumOrderLineSubtotal(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.qty || 0),
    0
  );
}

async function decrementCigaretteBalances(cafeId, items) {
  const deduction = (Array.isArray(items) ? items : []).reduce((sum, line) => {
    return sum + Number(line?.price || 0) * Number(line?.qty || 0);
  }, 0);
  if (deduction <= 0) return;
  await Cafe.updateOne(
    { _id: cafeId },
    { $inc: { cigarettePrincipalBalance: -Number(deduction.toFixed(2)) } }
  );
}

function cigaretteAccounting(items) {
  return (Array.isArray(items) ? items : []).reduce((result, item) => {
    const qty = Number(item?.qty || 0);
    const principal = Number(item?.principalPerPiece ?? item?.costPrice ?? 0);
    const profit = Number(item?.profitPerPiece ?? (Number(item?.price || 0) - principal));
    result.principal += principal * qty;
    result.profit += profit * qty;
    return result;
  }, { principal: 0, profit: 0 });
}

function mergeOrderNotes(existingNotes, nextNotes) {
  const current = typeof existingNotes === "string" ? existingNotes.trim() : "";
  const incoming = typeof nextNotes === "string" ? nextNotes.trim() : "";
  if (!incoming) return current;
  if (!current) return incoming;
  if (current === incoming) return current;
  return `${current}\n${incoming}`;
}

function applyOrderStatusTiming(update, previousOrder = null) {
  const nextStatus = typeof update?.status === "string" ? update.status.trim().toLowerCase() : "";
  if (!nextStatus) return update;

  const prevStatus = String(previousOrder?.status || "").toLowerCase();
  const now = new Date();
  const existingAcceptedAt = previousOrder?.acceptedAt || update.acceptedAt || null;

  if (nextStatus === "pending") {
    update.acceptedAt = null;
    update.servedAt = null;
    update.acceptToServeMs = null;
    return update;
  }

  if (nextStatus === "accepted" && prevStatus !== "accepted") {
    update.acceptedAt = existingAcceptedAt || now;
    update.servedAt = null;
    update.acceptToServeMs = null;
    return update;
  }

  if (["preparing", "ready"].includes(nextStatus) && !existingAcceptedAt) {
    update.acceptedAt = now;
    update.servedAt = null;
    update.acceptToServeMs = null;
    return update;
  }

  if (nextStatus === "served" && prevStatus !== "served") {
    const acceptedAt = existingAcceptedAt || now;
    const servedAt = now;
    update.acceptedAt = acceptedAt;
    update.servedAt = servedAt;
    if (acceptedAt) {
      update.acceptToServeMs = Math.max(0, servedAt.getTime() - new Date(acceptedAt).getTime());
    } else {
      update.acceptToServeMs = null;
    }
  }

  return update;
}

async function findActiveOrderForMerge({
  cafeId,
  tableNumber,
  sessionId,
  customerId,
  visitId,
  orderType = "food",
}) {
  const ownership = buildCustomerOrderOwnershipQuery({ sessionId, customerId, visitId });
  if (ownership.length === 0) return null;

  const kind = String(orderType || "food").toLowerCase() === "cigarette" ? "cigarette" : "food";

  return Order.findOne({
    cafeId,
    tableNumber: Number(tableNumber),
    status: { $nin: ["paid", "rejected"] },
    $or: ownership,
    $and: [
      {
        $or:
          kind === "cigarette"
            ? [{ orderType: "cigarette" }]
            : [{ orderType: "food" }, { orderType: { $exists: false } }, { orderType: null }],
      },
    ],
  }).sort({ createdAt: 1 });
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
    let parsedTableNumber;
    try {
      parsedTableNumber = validateTableNumberForCafe(tableNumber, cafe);
    } catch (error) {
      return res.status(error.status || 400).json({ message: error.message });
    }
    if (!verifyTableToken(cafeId, parsedTableNumber, tableToken)) {
      return res.status(403).json({ message: "Invalid table token" });
    }
    if (!customerName) return res.status(400).json({ message: "customerName is required" });
    if (!phone) return res.status(400).json({ message: "phone is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }
    const rawPhone = typeof phone === "string" ? phone.trim() : "";
    if (!isValidPhone(rawPhone)) {
      return res.status(400).json({ message: "phone must contain 7 to 15 digits" });
    }
    const normalizedPhone = normalizePhone(rawPhone);
    const sessionId = req.sessionId || "";
    const linkedCustomer = await upsertCustomerFromOrder({
      phone: normalizedPhone,
      name: customerName,
      tableNumber: parsedTableNumber,
      cafeId,
    });

    const { resolvedItems, lineSubtotal, menuMap } = await resolveOrderItems(cafeId, items);
    const cigaretteCategorySet = buildCigaretteCategorySet(cafe);
    const hasCigaretteItem = resolvedItems.some((item) => {
      const menuDoc = menuMap.get(String(item.menuItemId));
      return isCigaretteMenuItem(menuDoc, cigaretteCategorySet);
    });
    if (hasCigaretteItem) {
      return res.status(400).json({
        message:
          "Cigarettes are not available for QR ordering. Please ask at the counter.",
      });
    }

    const paymentValue = normalizePaymentMode(paymentMode, "cash");
    const activeOrder = await findActiveOrderForMerge({
      cafeId,
      tableNumber: parsedTableNumber,
      sessionId,
      customerId: linkedCustomer?._id || null,
      visitId: visit,
      orderType: "food",
    });

    let order;
    let responseStatus = 201;
    let emittedEvent = "NEW_ORDER";

    if (activeOrder) {
      const mergedItems = mergeOrderItems(activeOrder.items, resolvedItems);
      const {
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
      } = computeOrderTotals(cafe, sumOrderLineSubtotal(mergedItems));

      activeOrder.visitId = visit;
      activeOrder.sessionId = sessionId;
      activeOrder.customerId = linkedCustomer?._id || activeOrder.customerId || null;
      activeOrder.customerName = customerName;
      activeOrder.phone = normalizedPhone;
      activeOrder.notes = mergeOrderNotes(activeOrder.notes, notes);
      activeOrder.items = mergedItems;
      activeOrder.subtotalAmount = subtotalAmount;
      activeOrder.discountAmount = discountAmount;
      activeOrder.taxAmount = taxAmount;
      activeOrder.totalAmount = totalAmount;
      activeOrder.paymentMode = paymentValue;
      activeOrder.source = "qr";
      activeOrder.status = "pending";
      activeOrder.acceptedAt = null;
      activeOrder.servedAt = null;
      activeOrder.acceptToServeMs = null;
      activeOrder.paidAt = null;
      order = await activeOrder.save();
      responseStatus = 200;
      emittedEvent = "ORDER_UPDATED";
    } else {
      const { subtotalAmount, discountAmount, taxAmount, totalAmount } = computeOrderTotals(cafe, lineSubtotal);
      order = await Order.create({
        cafeId,
        tableNumber: parsedTableNumber,
        visitId: visit,
        sessionId,
        customerId: linkedCustomer?._id || null,
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
        orderType: "food",
        status: "pending",
      });
    }

    await Table.findOneAndUpdate(
      { cafeId, tableNumber: parsedTableNumber },
      { $set: { status: "reserved" } }
    );

    const responseOrder = typeof order?.toObject === "function" ? order.toObject() : order;
    const responsePayload = {
      ...responseOrder,
      mergedIntoExisting: emittedEvent === "ORDER_UPDATED",
      addedItemsCount: resolvedItems.reduce((sum, item) => sum + Number(item?.qty || 0), 0),
    };

    emitCafeEvent(order.cafeId, "NEW_ORDER", responsePayload);
    if (emittedEvent === "ORDER_UPDATED") {
      emitCafeEvent(order.cafeId, "ORDER_UPDATED", responsePayload);
    }

    try {
      await attachOrderToSession({
        sessionId,
        customerId: linkedCustomer?._id || null,
        cafeId,
        tableNumber,
        orderId: order._id,
      });
      if (linkedCustomer) signCustomerCookie(res, linkedCustomer, req);
    } catch {
      // non-fatal
    }

    return res.status(responseStatus).json(responsePayload);
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
    const scope = String(req.query.scope || "").trim().toLowerCase();
    const orderType = String(req.query.orderType || "").trim().toLowerCase();

    if (scope === "cigarette_live" || orderType === "cigarette") {
      q.orderType = "cigarette";
    } else if (orderType === "food") {
      q.$or = [{ orderType: "food" }, { orderType: { $exists: false } }, { orderType: null }];
    } else if (orderType === "all" || scope === "history") {
      // History (and explicit all) includes food + cigarette tickets
    } else {
      // Default live boards: exclude cigarette tickets
      q.$or = [{ orderType: "food" }, { orderType: { $exists: false } }, { orderType: null }];
    }

    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(String(from));
      if (to) q.createdAt.$lte = new Date(String(to));
    } else if (scope === "kitchen_live") {
      // Server-time based "business day" filter for the kitchen dashboard.
      // Keeps the UI independent of device/system time.
      q.createdAt = { $gte: businessDayStartLocal({ startHour: 1 }) };
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

    // Waiters only see food orders after the chef marks them ready. The chef
    // dashboard owns the full live lifecycle, including service and payment.
    if (
      req.user?.role === "staff" &&
      scope !== "history" &&
      scope !== "cigarette_live"
    ) {
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

    if (scope === "cigarette_live") {
      q.status = { $nin: ["paid", "rejected"] };
    }

    const orders = await Order.find(q).sort({ createdAt: -1 }).lean();
    const normalizedOrders = orders.map((order) => {
      if (String(order?.orderType || "").toLowerCase() !== "cigarette") return order;
      const items = (order.items || []).map((item) => ({
        ...item,
        price: getCigaretteSalePrice(item),
      }));
      const totalAmount = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
      return { ...order, items, subtotalAmount: totalAmount, totalAmount };
    });
    return res.json(normalizedOrders);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getPopularMenuItemsByCafe = async (req, res) => {
  try {
    const { cafeId } = req.params;
    if (!cafeId || !mongoose.Types.ObjectId.isValid(cafeId)) {
      return res.status(400).json({ message: "cafeId is required" });
    }
    if (!canAccessCafe(req.user, cafeId)) {
      return forbiddenTenant(res);
    }

    const cafeObjectId = new mongoose.Types.ObjectId(cafeId);
    const popularItems = await Order.aggregate([
      {
        $match: {
          cafeId: cafeObjectId,
          status: { $ne: "rejected" },
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.menuItemId": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$items.menuItemId",
          totalQty: { $sum: { $ifNull: ["$items.qty", 0] } },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalQty: -1, orderCount: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: MenuItem.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "menuItem",
        },
      },
      { $unwind: "$menuItem" },
      {
        $match: {
          "menuItem.cafeId": cafeObjectId,
        },
      },
      {
        $project: {
          _id: 0,
          menuItemId: { $toString: "$_id" },
          name: "$menuItem.name",
          category: "$menuItem.category",
          description: "$menuItem.description",
          price: "$menuItem.price",
          isAvailable: "$menuItem.isAvailable",
          totalQty: 1,
          orderCount: 1,
        },
      },
      { $limit: 12 },
    ]);

    return res.json(popularItems);
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
    const visitId = typeof req.query.visitId === "string" ? req.query.visitId.trim() : "";

    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!verifyTableToken(cafeId, tableNumber, token)) {
      return res.status(403).json({ message: "Invalid table token" });
    }

    const sessionId = req.sessionId || "";
    const current = await getCurrentCustomer(req).catch(() => null);
    const customerId = current?.customer?._id || null;
    const ownership = buildCustomerOrderOwnershipQuery({ sessionId, customerId, visitId });
    if (ownership.length === 0) return res.json([]);
    const trackedOrderIds = await getTrackedOrderIds({ sessionId, customerId });

    const query = {
      cafeId,
      tableNumber: Number(tableNumber),
      $or: ownership,
    };
    if (trackedOrderIds.length > 0) {
      query._id = { $in: trackedOrderIds };
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    await upsertSessionState({
      sessionId,
      cafeId,
      tableNumber: Number(tableNumber),
      customerId: customerId ? String(customerId) : null,
    });

    return res.json(orders);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error", error });
  }
};

exports.createStaffOrder = async (req, res) => {
  try {
    const actorCafeId = req.user?.cafeId ? String(req.user.cafeId) : "";
    const cafeId = req.user?.role === "super_admin" ? req.body?.cafeId || actorCafeId : actorCafeId;
    const rawTableNumber = req.body?.tableNumber;
    const tableNumber = rawTableNumber === null || rawTableNumber === "" || typeof rawTableNumber === "undefined"
      ? null
      : Number(rawTableNumber);
    let customerName = String(req.body?.customerName || "").trim();
    const rawPhone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    let phone = normalizePhone(rawPhone);
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    const requestedOrderType = String(req.body?.orderType || "").trim().toLowerCase();
    const status = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "pending";

    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!canAccessCafe(req.user, cafeId)) return forbiddenTenant(res);
    if (tableNumber !== null && (!tableNumber || tableNumber < 1)) {
      return res.status(400).json({ message: "tableNumber must be >= 1" });
    }

    const allowedStatuses = ["pending", "accepted", "preparing", "ready", "served"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status for manual order" });
    }

    const { cafe, resolvedItems, menuMap, cigaretteCategorySet, subtotalAmount, discountAmount, taxAmount, totalAmount, principalAmount, profitAmount } =
      await buildResolvedOrderPayload(cafeId, req.body?.items, { allowUnavailable: true });

    if (tableNumber !== null) {
      try {
        validateTableNumberForCafe(tableNumber, cafe);
      } catch (error) {
        return res.status(error.status || 400).json({ message: error.message });
      }
    }

    if (cafe.isActive === false) {
      return res.status(403).json({ message: "This cafe is not accepting orders" });
    }

    const allCigarette = resolvedItems.every((item) =>
      isCigaretteMenuItem(menuMap.get(String(item.menuItemId)), cigaretteCategorySet)
    );
    const anyCigarette = resolvedItems.some((item) =>
      isCigaretteMenuItem(menuMap.get(String(item.menuItemId)), cigaretteCategorySet)
    );

    if (anyCigarette && !allCigarette) {
      return res.status(400).json({ message: "Cigarette and food items cannot be mixed in one order" });
    }

    const orderType =
      requestedOrderType === "cigarette" || allCigarette ? "cigarette" : "food";

    if (orderType === "cigarette") {
      customerName = "";
      phone = "";
    } else {
      if (!customerName) return res.status(400).json({ message: "customerName is required for manual orders" });
      if (!isValidPhone(rawPhone)) {
        return res.status(400).json({ message: "phone must contain 7 to 15 digits" });
      }
    }

    const linkedCustomer = orderType === "food"
      ? await upsertCustomerFromOrder({ phone, name: customerName, tableNumber, cafeId })
      : null;

    if (orderType === "cigarette" && !allCigarette) {
      return res.status(400).json({ message: "Cigarette orders may only include cigarette menu items" });
    }

    if (req.user?.role === "staff" && orderType !== "cigarette") {
      return res.status(403).json({ message: "Waiters may only create cigarette orders" });
    }

    // Cigarette pricing is principal + profit per piece. Counter orders do not
    // require an inventory quantity to be entered before they can be created.
    let order;
    try {
      order = await Order.create({
        cafeId,
        tableNumber,
        visitId: "",
        customerId: linkedCustomer?._id || null,
        customerName,
        phone,
        notes,
        items: resolvedItems,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        principalAmount,
        profitAmount,
        paymentMode: normalizePaymentMode(req.body?.paymentMode, "cash"),
        source: "manual",
        orderType,
        status,
        ...(status === "accepted"
          ? { acceptedAt: new Date(), servedAt: null, acceptToServeMs: null }
          : {}),
        ...(status === "served"
          ? {
            acceptedAt: new Date(),
            servedAt: new Date(),
            acceptToServeMs: 0,
          }
          : {}),
      });
    } catch (error) {
      throw error;
    }

    // Cigarette counter sales should not fight dining table reserved/free state.
    if (orderType !== "cigarette" && tableNumber) {
      await Table.findOneAndUpdate(
        { cafeId, tableNumber },
        { $set: { status: ["served", "paid", "rejected"].includes(status) ? "free" : "reserved" } }
      );
    }

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
    const visitId = typeof req.query.visitId === "string" ? req.query.visitId.trim() : "";
    if (!tableNumber) return res.status(400).json({ message: "tableNumber is required" });
    if (!verifyTableToken(cafeId, tableNumber, token)) {
      return res.status(403).json({ message: "Invalid table token" });
    }
    const sessionId = req.sessionId || "";
    const current = await getCurrentCustomer(req).catch(() => null);
    const customerId = current?.customer?._id || null;
    const ownership = buildCustomerOrderOwnershipQuery({ sessionId, customerId, visitId });
    if (ownership.length === 0) {
      return res.status(403).json({ message: "Could not determine customer session" });
    }
    const order = await Order.findOne({
      _id: id,
      cafeId,
      tableNumber: Number(tableNumber),
      $or: ownership,
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

    if (Object.prototype.hasOwnProperty.call(update, "orderType")) {
      delete update.orderType;
    }

    if (Object.prototype.hasOwnProperty.call(update, "tableNumber")) {
      const rawTableNumber = update.tableNumber;
      const nextTableNumber = rawTableNumber === null || rawTableNumber === "" || typeof rawTableNumber === "undefined"
        ? null
        : Number(rawTableNumber);
      if (nextTableNumber !== null && (!nextTableNumber || nextTableNumber < 1)) {
        return res.status(400).json({ message: "tableNumber must be >= 1" });
      }
      if (nextTableNumber !== null) {
        const cafe = await Cafe.findById(prev.cafeId).lean();
        try {
          validateTableNumberForCafe(nextTableNumber, cafe);
        } catch (error) {
          return res.status(error.status || 400).json({ message: error.message });
        }
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
      const rawPhone = typeof update.phone === "string" ? update.phone.trim() : "";
      if (!isValidPhone(rawPhone)) {
        return res.status(400).json({ message: "phone must contain 7 to 15 digits" });
      }
      update.phone = normalizePhone(rawPhone);
    }

    if (Object.prototype.hasOwnProperty.call(update, "notes")) {
      update.notes = typeof update.notes === "string" ? update.notes.trim() : "";
    }

    const prevOrderType =
      String(prev.orderType || "food").toLowerCase() === "cigarette" ? "cigarette" : "food";

    if (Object.prototype.hasOwnProperty.call(update, "status")) {
      const previousStatus = String(prev.status || "pending").toLowerCase();
      const nextStatus = String(update.status || "").toLowerCase();
      const normalizeProgressStatus = (value) => (value === "baking" ? "preparing" : value);
      const progressStatuses = ["pending", "accepted", "preparing", "ready", "served", "paid"];
      const previousIndex = progressStatuses.indexOf(normalizeProgressStatus(previousStatus));
      const nextIndex = progressStatuses.indexOf(normalizeProgressStatus(nextStatus));

      if (["paid", "rejected"].includes(previousStatus) && nextStatus !== previousStatus) {
        return res.status(400).json({ message: "Paid or rejected orders cannot change status" });
      }
      if (nextStatus !== "rejected" && previousIndex !== -1 && nextIndex !== -1 && nextIndex < previousIndex) {
        return res.status(400).json({ message: "Order status cannot move backwards" });
      }
    }

    if (Array.isArray(update.items)) {
      if (["paid", "rejected"].includes(String(prev.status || "").toLowerCase())) {
        return res.status(400).json({ message: "Paid or rejected orders cannot be edited" });
      }
      const { resolvedItems, menuMap, cigaretteCategorySet, subtotalAmount, discountAmount, taxAmount, totalAmount, principalAmount, profitAmount } =
        await buildResolvedOrderPayload(String(prev.cafeId), update.items, {
          allowUnavailable: prevOrderType === "cigarette",
        });
      assertItemsMatchOrderType(resolvedItems, menuMap, cigaretteCategorySet, prevOrderType);
      update.items = resolvedItems;
      update.subtotalAmount = subtotalAmount;
      update.discountAmount = discountAmount;
      update.taxAmount = taxAmount;
      update.totalAmount = totalAmount;
      update.principalAmount = principalAmount;
      update.profitAmount = profitAmount;
    }

    if (prevOrderType === "cigarette" && String(update.status || "").toLowerCase() === "paid") {
      const normalizedPaidOrder = await buildResolvedOrderPayload(
        String(prev.cafeId),
        (update.items || prev.items || []).map((item) => ({ menuItemId: item.menuItemId, qty: item.qty }))
        , { allowUnavailable: true }
      );
      update.items = normalizedPaidOrder.resolvedItems;
      update.subtotalAmount = normalizedPaidOrder.subtotalAmount;
      update.discountAmount = normalizedPaidOrder.discountAmount;
      update.taxAmount = normalizedPaidOrder.taxAmount;
      update.totalAmount = normalizedPaidOrder.totalAmount;
      const accounting = cigaretteAccounting(update.items || prev.items);
      update.principalAmount = Number(accounting.principal.toFixed(2));
      update.profitAmount = Number(accounting.profit.toFixed(2));
    }

    const previousStatus = String(prev.status || "").toLowerCase();
    const nextStatus = String(update.status || prev.status || "").toLowerCase();
    if (prevOrderType === "cigarette" && previousStatus !== "paid" && nextStatus === "paid") {
      await decrementCigaretteBalances(String(prev.cafeId), update.items || prev.items);
    }

    applyOrderStatusTiming(update, prev);

    let order;
    try {
      order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    } catch (error) {
      throw error;
    }
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    emitCafeEvent(order.cafeId, "ORDER_UPDATED", order);

    if (prevStatus !== order.status) {
      if (order.status === "ready") emitCafeEvent(order.cafeId, "ORDER_READY", order);
      if (order.status === "paid") emitCafeEvent(order.cafeId, "ORDER_PAID", order);
    }

    const isCigaretteOrder =
      String(order.orderType || "food").toLowerCase() === "cigarette";

    if (!isCigaretteOrder) {
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
    }

    if (!isCigaretteOrder && prevTableNumber && prevTableNumber !== Number(order.tableNumber)) {
      const oldTableHasActiveOrders = await Order.exists({
        cafeId: order.cafeId,
        tableNumber: prevTableNumber,
        status: { $nin: ["served", "paid", "rejected"] },
        orderType: { $ne: "cigarette" },
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

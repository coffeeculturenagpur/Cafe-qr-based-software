const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const { normalizePhone } = require("../utils/phone");
const {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_COOKIE_MAX_AGE_MS,
  signCustomerToken,
  verifyCustomerToken,
} = require("../utils/customerSession");
const { linkSessionCustomer } = require("../services/sessionStore");

function customerSecret() {
  return process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET;
}

function isSecureRequest(req) {
  if (req?.secure) return true;
  const forwardedProto = req?.headers?.["x-forwarded-proto"];
  if (typeof forwardedProto === "string") {
    return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  }
  return false;
}

function getCustomerCookieOptions(req) {
  const secure = process.env.NODE_ENV === "production" || isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: CUSTOMER_COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

async function loadCurrentCustomer(req) {
  const token = req.cookies?.[CUSTOMER_COOKIE_NAME];
  if (!token) return { status: 401, message: "Not signed in" };

  const verified = verifyCustomerToken({ req, token, secret: customerSecret() });
  if (verified.status) return verified;

  const customer = await Customer.findById(verified.payload.sub).lean();
  if (!customer) return { status: 401, message: "Customer not found" };

  return { customer };
}

/** Top menu items this customer has ordered at a cafe (by phone match on past orders). */
exports.getFavorites = async (req, res) => {
  try {
    const cafeId = req.query.cafeId;
    if (!cafeId || !mongoose.Types.ObjectId.isValid(cafeId)) {
      return res.status(400).json({ message: "cafeId query parameter is required" });
    }

    const current = await loadCurrentCustomer(req);
    if (current.status) return res.status(current.status).json({ message: current.message });
    const { customer } = current;
    exports.signCustomerCookie(res, customer, req);
    await linkSessionCustomer(req.sessionId || "", customer._id);

    const normalized = normalizePhone(customer.phone);
    if (!normalized) return res.json({ items: [] });

    const filtered = await Order.find({
      cafeId: new mongoose.Types.ObjectId(cafeId),
      phone: normalized,
      status: { $in: ["paid", "served"] },
    })
      .select("items")
      .lean();

    const byKey = new Map();
    for (const o of filtered) {
      const oid = String(o._id);
      for (const it of o.items || []) {
        const name = String(it.name || "").trim();
        const mid = it.menuItemId ? String(it.menuItemId) : null;
        const key = mid || `name:${name.toLowerCase()}`;
        let row = byKey.get(key);
        if (!row) {
          row = {
            menuItemId: mid,
            name: name || "Item",
            totalQty: 0,
            orderIds: new Set(),
          };
          byKey.set(key, row);
        }
        row.totalQty += Number(it.qty) || 0;
        row.orderIds.add(oid);
        if (mid) row.menuItemId = mid;
        if (name) row.name = name;
      }
    }

    const items = [...byKey.values()]
      .map((row) => ({
        menuItemId: row.menuItemId,
        name: row.name,
        totalQty: row.totalQty,
        orderCount: row.orderIds.size,
      }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 12);

    return res.json({ items });
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const current = await loadCurrentCustomer(req);
    if (current.status) return res.status(current.status).json({ message: current.message });
    const { customer } = current;
    exports.signCustomerCookie(res, customer, req);
    await linkSessionCustomer(req.sessionId || "", customer._id);
    return res.json({
      id: String(customer._id),
      name: customer.name,
      phone: customer.phone,
      lastTableNumber: customer.lastTableNumber,
      lastCafeId: customer.lastCafeId ? String(customer.lastCafeId) : null,
    });
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
};

exports.signCustomerCookie = (res, customerDoc, req) => {
  const secret = customerSecret();
  const token = signCustomerToken({ customerId: customerDoc?._id, req, secret });
  if (!token) return;
  res.cookie(CUSTOMER_COOKIE_NAME, token, getCustomerCookieOptions(req));
};

exports.getCurrentCustomer = async (req) => {
  return loadCurrentCustomer(req);
};

exports.upsertCustomerFromOrder = async ({ phone, name, tableNumber, cafeId }) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const customer = await Customer.findOneAndUpdate(
    { phone: normalized },
    {
      $set: {
        name: String(name || "").trim() || "Guest",
        lastTableNumber: Number(tableNumber) || null,
        lastCafeId: cafeId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return customer;
};

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const { normalizePhone } = require("../utils/phone");

function customerSecret() {
  return process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET;
}

/** Top menu items this customer has ordered at a cafe (by phone match on past orders). */
exports.getFavorites = async (req, res) => {
  try {
    const token = req.cookies?.qrdine_customer;
    if (!token) return res.status(401).json({ message: "Not signed in" });
    const secret = customerSecret();
    if (!secret) return res.status(500).json({ message: "JWT secret not configured" });
    const payload = jwt.verify(token, secret);
    if (payload.aud !== "customer") return res.status(401).json({ message: "Invalid session" });

    const cafeId = req.query.cafeId;
    if (!cafeId || !mongoose.Types.ObjectId.isValid(cafeId)) {
      return res.status(400).json({ message: "cafeId query parameter is required" });
    }

    const customer = await Customer.findById(payload.sub).lean();
    if (!customer) return res.status(401).json({ message: "Customer not found" });

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
    const token = req.cookies?.qrdine_customer;
    if (!token) return res.status(401).json({ message: "Not signed in" });
    const secret = customerSecret();
    if (!secret) return res.status(500).json({ message: "JWT secret not configured" });
    const payload = jwt.verify(token, secret);
    if (payload.aud !== "customer") return res.status(401).json({ message: "Invalid session" });
    const customer = await Customer.findById(payload.sub).lean();
    if (!customer) return res.status(401).json({ message: "Customer not found" });
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

exports.signCustomerCookie = (res, customerDoc) => {
  const secret = customerSecret();
  if (!secret) return;
  const token = jwt.sign(
    { sub: String(customerDoc._id), aud: "customer" },
    secret,
    { expiresIn: "7d" }
  );
  res.cookie("qrdine_customer", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
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

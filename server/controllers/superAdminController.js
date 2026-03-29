const mongoose = require("mongoose");
const Cafe = require("../models/Cafe");
const Order = require("../models/Order");
const User = require("../models/User");

exports.getOverview = async (req, res) => {
  try {
    const cafeId = req.query.cafeId || null;
    const cafeMatch = cafeId ? { _id: new mongoose.Types.ObjectId(cafeId) } : {};
    const orderMatch = cafeId ? { cafeId: new mongoose.Types.ObjectId(cafeId) } : {};

    const cafes = await Cafe.find(cafeMatch).sort({ createdAt: -1 }).lean();

    const orderAgg = await Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: "$cafeId",
          totalOrders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "rejected"] }, 0, "$totalAmount"],
            },
          },
          paidOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const staffAgg = await User.aggregate([
      {
        $match: {
          role: { $ne: "super_admin" },
          ...(cafeId ? { cafeId: new mongoose.Types.ObjectId(cafeId) } : {}),
        },
      },
      {
        $group: {
          _id: { cafeId: "$cafeId", role: "$role" },
          count: { $sum: 1 },
        },
      },
    ]);

    const orderMap = new Map();
    orderAgg.forEach((row) => {
      orderMap.set(String(row._id), row);
    });

    const staffMap = new Map();
    staffAgg.forEach((row) => {
      const cafeKey = String(row._id.cafeId);
      if (!staffMap.has(cafeKey)) staffMap.set(cafeKey, {});
      staffMap.get(cafeKey)[row._id.role] = row.count;
    });

    const overview = cafes.map((cafe) => {
      const orderStats = orderMap.get(String(cafe._id)) || { totalOrders: 0, revenue: 0, paidOrders: 0 };
      const staffStats = staffMap.get(String(cafe._id)) || {};
      const staffTotal = Object.values(staffStats).reduce((sum, v) => sum + v, 0);

      return {
        cafeId: String(cafe._id),
        name: cafe.name,
        address: cafe.address,
        numberOfTables: cafe.numberOfTables || 0,
        totalOrders: orderStats.totalOrders || 0,
        revenue: orderStats.revenue || 0,
        paidOrders: orderStats.paidOrders || 0,
        staffCounts: staffStats,
        staffTotal,
      };
    });

    return res.json({ cafes: overview });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const cafeId = req.query.cafeId || null;
    const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const match = { createdAt: { $gte: start } };
    if (cafeId) {
      match.cafeId = new mongoose.Types.ObjectId(cafeId);
    }

    const byDay = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: {
            $sum: {
              $cond: [{ $eq: ["$status", "rejected"] }, 0, "$totalAmount"],
            },
          },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const statusBreakdown = await Order.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const paidRevenue = await Order.aggregate([
      { $match: { ...match, status: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    return res.json({
      byDay,
      statusBreakdown,
      paidRevenueTotal: paidRevenue[0]?.total || 0,
      rangeDays: days,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

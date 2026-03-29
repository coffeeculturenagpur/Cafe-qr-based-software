const mongoose = require("mongoose");
const Cafe = require("../models/Cafe");
const Order = require("../models/Order");

function getCafeIdFromRequest(req) {
  if (req.user?.role === "super_admin") {
    return req.query.cafeId || req.body.cafeId || null;
  }
  return req.user?.cafeId || null;
}

function normalizeImageList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

exports.getCafe = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const cafe = await Cafe.findById(cafeId).lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });
    return res.json(cafe);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getNonSmokingImages = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const cafe = await Cafe.findById(cafeId).select("showcaseNonSmokingShots").lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    return res.json({
      showcaseNonSmokingShots: normalizeImageList(cafe.showcaseNonSmokingShots),
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const match = {
      cafeId: new mongoose.Types.ObjectId(cafeId),
      createdAt: { $gte: start },
    };

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

exports.updateCafe = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const updates = {};
    if (typeof req.body.name === "string") updates.name = req.body.name;
    if (typeof req.body.address === "string") updates.address = req.body.address;
    if (typeof req.body.logoUrl === "string") updates.logoUrl = req.body.logoUrl;
    if (typeof req.body.brandImageUrl === "string") updates.brandImageUrl = req.body.brandImageUrl;
    if (typeof req.body.upiQrUrl === "string") updates.upiQrUrl = req.body.upiQrUrl;
    if (typeof req.body.customerOrderBaseUrl === "string") {
      updates.customerOrderBaseUrl = req.body.customerOrderBaseUrl.trim();
    }
    if (typeof req.body.taxPercent !== "undefined") updates.taxPercent = Number(req.body.taxPercent || 0);
    if (typeof req.body.discountType === "string") updates.discountType = req.body.discountType;
    if (typeof req.body.discountValue !== "undefined") {
      updates.discountValue = Number(req.body.discountValue || 0);
    } else if (typeof req.body.discountPercent !== "undefined") {
      updates.discountType = "percent";
      updates.discountValue = Number(req.body.discountPercent || 0);
    }
    if (typeof req.body.latitude !== "undefined") updates.latitude = req.body.latitude === null ? null : Number(req.body.latitude);
    if (typeof req.body.longitude !== "undefined") updates.longitude = req.body.longitude === null ? null : Number(req.body.longitude);
    if (typeof req.body.serviceRadiusMeters !== "undefined") {
      updates.serviceRadiusMeters = Number(req.body.serviceRadiusMeters || 0);
    }
    if (typeof req.body.primaryColor === "string") updates.primaryColor = req.body.primaryColor;
    if (typeof req.body.accentColor === "string") updates.accentColor = req.body.accentColor;
    if (typeof req.body.venueTimezone === "string") updates.venueTimezone = req.body.venueTimezone;
    if (Array.isArray(req.body.showcaseHighlights)) {
      updates.showcaseHighlights = req.body.showcaseHighlights.map((it = {}) => ({
        name: typeof it.name === "string" ? it.name : "",
        note: typeof it.note === "string" ? it.note : "",
        tag: typeof it.tag === "string" ? it.tag : "",
        price: typeof it.price !== "undefined" ? Number(it.price || 0) : 0,
        image: typeof it.image === "string" ? it.image : "",
      }));
    }
    if (Array.isArray(req.body.showcaseCommunityNotes)) {
      updates.showcaseCommunityNotes = req.body.showcaseCommunityNotes.map((it = {}) => ({
        quote: typeof it.quote === "string" ? it.quote : "",
        name: typeof it.name === "string" ? it.name : "",
        tag: typeof it.tag === "string" ? it.tag : "",
      }));
    }
    if (Array.isArray(req.body.showcaseCommunityShots)) {
      updates.showcaseCommunityShots = req.body.showcaseCommunityShots
        .filter((s) => typeof s === "string")
        .map((s) => s);
    }

    let incomingLen = 0;
    let filteredLen = 0;
    let filteredFirst = null;

    if (Array.isArray(req.body.showcaseNonSmokingShots)) {
      incomingLen = req.body.showcaseNonSmokingShots.length;
      updates.showcaseNonSmokingShots = normalizeImageList(req.body.showcaseNonSmokingShots);
      filteredLen = updates.showcaseNonSmokingShots.length;
      filteredFirst = updates.showcaseNonSmokingShots[0] || null;
    }

    const cafe = await Cafe.findByIdAndUpdate(cafeId, updates, { new: true, strict: false });
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    // Return debug info only (does not persist to Mongo)
    const debug = {
      receivedIsArray: Array.isArray(req.body.showcaseNonSmokingShots),
      receivedLen: incomingLen,
      filteredLen,
      filteredFirst,
      controller: "adminCafeController.updateCafe",
    };

    return res.json({ ...(cafe?.toObject ? cafe.toObject() : cafe), __debugNonSmoking: debug });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.updateNonSmokingImages = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const showcaseNonSmokingShots = normalizeImageList(req.body.showcaseNonSmokingShots);

    const cafe = await Cafe.findByIdAndUpdate(
      cafeId,
      { showcaseNonSmokingShots },
      { new: true, strict: false }
    );
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    return res.json({
      showcaseNonSmokingShots: normalizeImageList(cafe.showcaseNonSmokingShots),
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};
